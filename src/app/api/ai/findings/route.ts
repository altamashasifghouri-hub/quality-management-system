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

function parseFindings(text: string, clauses: string[] = []): { department: string; clause?: string; type: string; detail: string; recommendation?: string }[] | null {
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
      return {
        department: String(f.department || "").trim() || "General",
        ...(clause ? { clause } : {}),
        type: normalizeSeverity(f.type || f.severity || f.risk || "Low"),
        detail: String(f.detail || f.finding || f.description || "").trim(),
        recommendation: String(f.recommendation || f.recommended_action || "").trim() || undefined,
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
  try {
    const body = await req.json();
    notes = String(body.notes || "").trim();
    departments = Array.isArray(body.departments) ? body.departments.map(String).filter(Boolean) : [];
    clauses = Array.isArray(body.clauses) ? body.clauses.map(String).filter(Boolean) : [];
    branchName = String(body.branchName || "");
    planTitle = String(body.planTitle || "");
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

  const promptText = [
    `You are an internal auditor. Convert the auditor's raw field notes below into a structured list of audit findings.`,
    `For each finding assign the department (MUST be one of these audited departments: ${departments.join(", ")}),`,
    `a risk type of exactly one of: ${SEVERITIES.join(", ")} (use Critical for life/safety or major money loss, High for serious process failures, Medium for moderate gaps, Low for minor issues/observations),`,
    `a clear factual detail description, and a practical recommendation for each.`,
    `Only use the departments listed above. Do not invent departments.`,
    clauseBlock,
    `Return ONLY a JSON array with no markdown, no prose, in this shape:`,
    clauses.length
      ? `[{"department":"Department Name","clause":"4.1 Understanding the organization and its context","type":"Medium","detail":"What was observed.","recommendation":"What should be done."}]`
      : `[{"department":"Department Name","type":"Medium","detail":"What was observed.","recommendation":"What should be done."}]`,
    ``,
    `Hotel/Branch: ${branchName || "Not provided"}`,
    `Audit: ${planTitle || "Internal Audit"}`,
    `Audited departments: ${departments.join(", ")}`,
    ``,
    `Raw audit notes:`,
    notes,
  ].join("\n");

  if (!apiKey) {
    return NextResponse.json({ findings: heuristicFindings(notes, departments, clauses), source: "heuristic" });
  }

  let lastError = "";
  for (const model of MODELS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 45000);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: promptText }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
          }),
          signal: controller.signal,
        }
      );
      clearTimeout(timer);
      if (!res.ok) {
        lastError = `${res.status} ${await res.text()}`;
        continue;
      }
      const json = await res.json();
      const text = (json.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("") || "";
      const findings = parseFindings(text, clauses);
      if (findings) return NextResponse.json({ findings, source: "generated" });
      lastError = "could not parse model output";
    } catch (e: any) {
      lastError = e?.message || "generation failed";
    }
  }

  const fallback = heuristicFindings(notes, departments, clauses);
  return NextResponse.json({ findings: fallback, source: "heuristic", lastError }, { status: 200 });
}