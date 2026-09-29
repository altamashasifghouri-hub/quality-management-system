import { NextResponse } from "next/server";
import { supabaseFromCookies } from "@/lib/google-oauth";

const SEVERITIES = ["Critical", "High", "Medium", "Low"];
const MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-flash-lite-latest"];

function normalizeSeverity(v: string) {
  const s = (v || "").toLowerCase();
  if (s.includes("critical")) return "Critical";
  if (s.includes("high")) return "High";
  if (s.includes("medium") || s.includes("moderate")) return "Medium";
  return "Low";
}

function resolveClause(v: string, clauses: string[]): string {
  const t = String(v || "").trim();
  if (!t) return "";
  const canon = clauses.find((c) => c.toLowerCase() === t.toLowerCase());
  if (canon) return canon;
  const num = (t.match(/^\s*(\d+(?:\.\d+)*)/) || [])[1];
  if (num) {
    const byNum = clauses.find((c) => c.split(" ")[0] === num || c.startsWith(num + " "));
    if (byNum) return byNum;
  }
  return "";
}

function parseFindings(text: string, clauses: string[] = []): { department: string; clause?: string; type: string; detail: string; recommendation?: string; policy?: string; policyClause?: string }[] | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const arr = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr.map((f: any) => {
      const clause = resolveClause(String(f.clause || ""), clauses);
      const policy = String(f.policy || f.policy_name || "").trim();
      const policyClause = String(f.policyClause || f.policy_clause || f.policy_section || "").trim();
      const sop = String(f.sop || f.sop_number || "").trim();
      const sopClause = String(f.sopClause || f.sop_clause || f.sop_section || "").trim();
      return {
        department: String(f.department || "").trim() || "General",
        ...(clause ? { clause } : {}),
        type: normalizeSeverity(f.type || f.severity || f.risk || "Low"),
        detail: String(f.detail || f.finding || f.description || "").trim(),
        recommendation: String(f.recommendation || f.recommended_action || "").trim() || undefined,
        ...(policy ? { policy: policy.slice(0, 200) } : {}),
        ...(policyClause ? { policyClause: policyClause.slice(0, 200) } : {}),
        ...(sop ? { sop: sop.slice(0, 200) } : {}),
        ...(sopClause ? { sopClause: sopClause.slice(0, 200) } : {}),
      };
    }).filter((f) => f.detail.length > 3);
  } catch {
    return null;
  }
}

function heuristicFindings(notes: string, departments: string[], clauses: string[] = []): { department: string; clause?: string; type: string; detail: string; recommendation?: string }[] {
  const lines = notes.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const results: { department: string; clause?: string; type: string; detail: string; recommendation?: string }[] = [];
  const lowerDeps = departments.map((d) => d.toLowerCase());
  lines.forEach((line) => {
    const matched = departments.filter((d, i) => line.toLowerCase().includes(lowerDeps[i]));
    const target = matched.length ? matched[0] : departments.length === 1 ? departments[0] : "General";
    const clause = resolveClause(line, clauses);
    results.push({
      department: target,
      ...(clause ? { clause } : {}),
      type: "Medium",
      detail: line.replace(/^\s*\d+(?:\.\d+)*[\s:.-]*/, "").trim() || line,
    });
  });
  return results;
}

export async function POST(req: Request) {
  const supabase = await supabaseFromCookies();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let notes = "";
  let departments: string[] = [];
  let clauses: string[] = [];
  let branchName = "";
  let planTitle = "";
  let policyText = "";
  let policyFilePath = "";
  let policyFileMime = "";
  try {
    const body = await req.json();
    notes = String(body.notes || "").trim();
    departments = Array.isArray(body.departments) ? body.departments.map(String).filter(Boolean) : [];
    clauses = Array.isArray(body.clauses) ? body.clauses.map(String).filter(Boolean) : [];
    branchName = String(body.branchName || "");
    planTitle = String(body.planTitle || "");
    policyText = String(body.policyText || "").trim().slice(0, 150000);
    policyFilePath = String(body.policyFilePath || "").trim();
    policyFileMime = String(body.policyFileMime || "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!notes) return NextResponse.json({ error: "Notepad is empty." }, { status: 400 });
  if (departments.length === 0) departments = ["General"];

  const apiKey = process.env.GEMINI_API_KEY;
  const clauseBlock = clauses.length
    ? [
        `Assign each finding to exactly one ISO 9001:2015 clause below (return the FULL clause text exactly as written — never abbreviate it). Use the clauses strictly as provided:`,
        clauses.join("\n"),
      ].join("\n")
    : "";

  const POLICY_INSTR = [
    `POLICY REFERENCE — if an observed issue amounts to a breach or non-compliance with any of the company's policies, identify the specific violated policy and section:`,
    `- "policy": the exact title/name of the violated policy (e.g. "6. Attendance, Lateness & Absence Policy" or "10.2 Tip Policy"). Return the full policy title exactly as written in the document.`,
    `- "policyClause": the specific numbered section/point within it (e.g. "6.1 Late Policy" or "10.2 A. Submission of Tips"). Return it exactly as written.`,
    `- A finding may violate only one policy — pick the single most relevant one. If the issue does not clearly violate any policy, OMIT both "policy" and "policyClause" entirely.`,
  ].join("\n");
  const SOP_INSTR = [
    `SOP REFERENCE — if an observed issue amounts to a failure to follow any departmental Standard Operating Procedure, identify the single most relevant SOP and set:`,
    `- "sop": the exact SOP number as written (e.g. "SOP-004").`,
    `- "sopClause": the specific numbered section / step / clause of that SOP that was violated (e.g. "4.2 Daily checklist sign-off"). Return it exactly as written in the SOP.`,
    `- If a finding also breaches the company policy document, include "policy" and "policyClause" as well. Both may appear together if both apply.`,
    `- If the issue does not clearly violate an SOP, OMIT "sop" and "sopClause" entirely.`,
  ].join("\n");

  const policyBlock = policyText
    ? ["", POLICY_INSTR, "", `BEGIN COMPANY POLICY DOCUMENT:`, policyText, "", `END COMPANY POLICY DOCUMENT.`].join("\n")
    : "";

  interface PdfPart { label: string; mimeType: string; data: string; }
  const pdfParts: PdfPart[] = [];
  let sopBlock = "";
  const sopRows: { department: string; sop_number: string; title: string | null; content: string | null }[] = [];
  let hasPolicyPdf = false;
  let hasSopPdf = false;
  try {
    const { data: sops } = await supabase.from("sop_documents").select("department, sop_number, title, content, file_path, file_mime").order("sop_number", { ascending: true });
    if (Array.isArray(sops)) {
      const depLower = departments.map((d) => d.toLowerCase());
      const relevant = sops.filter((s) => depLower.includes(String(s.department || "").trim().toLowerCase()));
      const MAX_SOPS = 8;
      const MAX_PER_SOP = 20000;
      const MAX_TOTAL = 100000;
      let budget = 0;
      for (const s of relevant) {
        if (sopRows.length + pdfParts.length >= MAX_SOPS || budget >= MAX_TOTAL) break;
        const isPdf = String(s.file_mime || "").toLowerCase().includes("pdf") && String(s.file_path || "").trim();
        if (isPdf) {
          const path = String(s.file_path).trim();
          try {
            const { data: pub } = supabase.storage.from("documents").getPublicUrl(path);
            const res = await fetch(pub.publicUrl, { method: "GET" });
            if (res.ok) {
              const buf = await res.arrayBuffer();
              const bytes = new Uint8Array(buf);
              let binary = "";
              for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
              pdfParts.push({ label: `SOP ${String(s.sop_number || "")}${s.title ? ` — ${s.title}` : ""}`, mimeType: "application/pdf", data: btoa(binary) });
              hasSopPdf = true;
              continue;
            }
          } catch { /* pdf fetch failed — fall back to text below */ }
        }
        const body = String(s.content || "").slice(0, MAX_PER_SOP);
        sopRows.push({ department: String(s.department || ""), sop_number: String(s.sop_number || ""), title: s.title || null, content: body });
        budget += body.length;
      }
    }
  } catch { /* sop lookup unavailable */ }

  if (policyFilePath && policyFileMime.includes("pdf")) {
    try {
      const { data: pub } = supabase.storage.from("documents").getPublicUrl(policyFilePath);
      const res = await fetch(pub.publicUrl, { method: "GET" });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        pdfParts.push({ label: "company policy document", mimeType: "application/pdf", data: btoa(binary) });
        hasPolicyPdf = true;
      }
    } catch { /* policy pdf fetch failed */ }
  }
  const hasPolicyRef = Boolean(policyText) || hasPolicyPdf;
  const hasSopRef = sopRows.length > 0 || hasSopPdf;

  if (sopRows.length) {
    sopBlock = [
      "",
      SOP_INSTR,
      "",
      ...sopRows.map((s) => `SOP ${s.sop_number}${s.title ? ` — ${s.title}` : ""} (${s.department}):\n${s.content}`),
      "",
      `END SOP REFERENCE.`,
    ].join("\n");
  }

  const shapeExample = `[{"department":"Department Name","type":"Medium","detail":"What was observed.","recommendation":"What should be done."${hasPolicyRef ? `,"policy":"6. Attendance, Lateness & Absence Policy","policyClause":"6.2 Absence & Leave Intimation"` : ""}${hasSopRef ? `,"sop":"SOP-004","sopClause":"4.2 Daily checklist sign-off"` : ""}${clauses.length ? `,"clause":"4.1 Understanding the organization and its context"` : ""}}]`;

  const tail = [
    `Return ONLY a JSON array with no markdown, no prose, in this shape:`,
    shapeExample,
    ``,
    `Hotel/Branch: ${branchName || "Not provided"}`,
    `Audit: ${planTitle || "Internal Audit"}`,
    `Audited departments: ${departments.join(", ")}`,
    ``,
    `Raw audit notes:`,
    notes,
  ];

  const promptText = [
    `You are an internal auditor. Convert the auditor's raw field notes below into a structured list of audit findings.`,
    `For each finding assign the department (MUST be one of these audited departments: ${departments.join(", ")}),`,
    `a risk type of exactly one of: ${SEVERITIES.join(", ")} (use Critical for life/safety or major money loss, High for serious process failures, Medium for moderate gaps, Low for minor issues/observations),`,
    `a clear factual detail description, and a practical recommendation for each.`,
    `Only use the departments listed above. Do not invent departments.`,
    clauseBlock,
    policyBlock,
    sopBlock,
    ...tail,
  ].join("\n");

  const policyFilesBlock = hasPolicyPdf
    ? ["", POLICY_INSTR, "", `The company policy document is attached below as a PDF. Read it directly and use the exact policy titles and section wording from it, including anything inside images or scanned pages.`].join("\n")
    : "";
  const sopFilesBlock = hasSopRef
    ? ["", SOP_INSTR, "", ...(sopRows.length ? [`SOP texts provided below:`, ...sopRows.map((s) => `SOP ${s.sop_number}${s.title ? ` — ${s.title}` : ""} (${s.department}):\n${s.content}`)] : [`The departmental SOPs are attached below as PDF files. Read them directly and use the exact SOP numbers and clause wording from them, including anything inside images or scanned pages.`])].join("\n")
    : "";

  const promptTextFiles = [
    `You are an internal auditor. Convert the auditor's raw field notes below into a structured list of audit findings.`,
    `The official documents needed to evaluate the notes are attached to this prompt as actual PDF files (read them directly — do not rely on anything besides what is inside the PDFs).`,
    `For each finding assign the department (MUST be one of these audited departments: ${departments.join(", ")}),`,
    `a risk type of exactly one of: ${SEVERITIES.join(", ")} (use Critical for life/safety or major money loss, High for serious process failures, Medium for moderate gaps, Low for minor issues/observations),`,
    `a clear factual detail description, and a practical recommendation for each.`,
    `Only use the departments listed above. Do not invent departments.`,
    clauseBlock,
    policyFilesBlock,
    sopFilesBlock,
    ...tail,
  ].join("\n");

  if (!apiKey) {
    return NextResponse.json({ findings: heuristicFindings(notes, departments, clauses), source: "heuristic" });
  }

  const attempts: { parts: any[] }[] = [];
  if (pdfParts.length) {
    attempts.push({
      parts: [{ text: promptTextFiles }, ...pdfParts.map((p) => ({ inlineData: { mimeType: p.mimeType, data: p.data } }))],
    });
  }
  attempts.push({ parts: [{ text: promptText }] });

  let lastError = "";
  for (const attempt of attempts) {
    for (const model of MODELS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 60000);
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: attempt.parts }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
            }),
            signal: controller.signal,
          }
        );
        clearTimeout(timer);
        if (!res.ok) {
          lastError = `${model}: ${res.status} ${await res.text()}`;
          continue;
        }
        const json = await res.json();
        const text = (json.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("") || "";
        const findings = parseFindings(text, clauses);
        if (findings) return NextResponse.json({ findings, source: "generated" });
        lastError = `${model}: could not parse model output`;
      } catch (e: any) {
        lastError = `${model}: ${e?.message || "generation failed"}`;
      }
    }
  }

  const fallback = heuristicFindings(notes, departments, clauses);
  return NextResponse.json({ findings: fallback, source: "heuristic", lastError }, { status: 200 });
}