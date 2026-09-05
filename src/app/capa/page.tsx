"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface CapaFinding {
  department: string;
  type: string;
  detail: string;
  recommendation?: string;
  evidence?: string[];
  observation?: string;
  root_cause?: string;
  corrective_action?: string;
  preventive_action?: string;
  ncr_number?: string;
  capa_pdf_url?: string;
  capa_pdf_file_id?: string;
  resolved?: boolean;
}

interface CapaPlan {
  id: string;
  title: string;
  branch_id: string;
  branch_name: string;
  document_number: string | null;
  date_of_plan: string | null;
  audit_period: string | null;
  signature: string | null;
  prepared_by: string | null;
  findings: CapaFinding[];
}

const LOGO = "/logo.jpg";
const SIG_DEFAULT = "/signature.png";

const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;

const sevColor: Record<string, string> = {
  Critical: "text-red-300 bg-red-500/20 border-red-500/30",
  High: "text-orange-200 bg-orange-500/20 border-orange-500/30",
  Medium: "text-amber-200 bg-amber-500/20 border-amber-500/30",
  Low: "text-blue-200 bg-blue-500/20 border-blue-500/30",
};

function sanitizeFile(name: string) {
  return name.replace(/[^a-zA-Z0-9]+/g, "_");
}

function formatDDMMYYYY(dateStr: string | null) {
  if (!dateStr) return "—";
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function splitLines(text: string | null) {
  return (text || "").split("\n").map((s) => s.trim()).filter(Boolean);
}

function genNcrNumber(branchName: string, existingNcrs: string[]) {
  const code = (branchName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase() || "QMS");
  const year = new Date().getFullYear();
  let maxSeq = 0;
  existingNcrs.forEach((n) => {
    const idx = n.lastIndexOf("-");
    if (idx >= 0) {
      const num = parseInt(n.slice(idx + 1), 10);
      if (!isNaN(num) && num > maxSeq) maxSeq = num;
    }
  });
  return `QMS/NCR/${year}/${code}-${String(maxSeq + 1).padStart(3, "0")}`;
}

const imageCache = new Map<string, string>();

async function assetToDataUrl(url: string): Promise<string> {
  if (!url) return "";
  const cached = imageCache.get(url);
  if (cached) return cached;
  let dataUrl = "";
  try {
    if (url.startsWith("data:")) {
      dataUrl = url;
    } else {
      const res = await fetch(url);
      if (!res.ok) return "";
      const blob = await res.blob();
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("file read failed"));
        reader.readAsDataURL(blob);
      });
    }
    imageCache.set(url, dataUrl);
  } catch {
    dataUrl = "";
  }
  return dataUrl;
}

function embedImage(doc: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number) {
  if (!dataUrl) return;
  const format = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
  try {
    doc.addImage(dataUrl, format, x, y, w, h);
  } catch {
    /* image embedding unavailable */
  }
}

function loadImageData(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas"));
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function CapaPage() {
  const supabase = createClient();
  const [plans, setPlans] = useState<CapaPlan[]>([]);
  const [settings, setSettings] = useState<{ hr_name: string; ceo_name: string }>({ hr_name: "", ceo_name: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 4000); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 5000); }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: b }, { data: settingsData }] = await Promise.all([
      supabase.from("internal_audits").select("*").order("created_at", { ascending: false }),
      supabase.from("branches").select("*"),
      supabase.from("settings").select("*").limit(1).maybeSingle(),
    ]);
    const branchName = new Map<string, string>((b || []).map((r: any) => [r.id, r.name]));
    setPlans((p || []).map((r: any) => ({
      id: r.id, title: r.title, branch_id: r.branch_id, branch_name: branchName.get(r.branch_id) || "Unassigned",
      document_number: r.document_number, date_of_plan: r.date_of_plan, audit_period: r.audit_period,
      signature: r.signature, prepared_by: r.prepared_by, findings: r.findings || [],
    })));
    if (settingsData) setSettings({ hr_name: settingsData.hr_name || "", ceo_name: settingsData.ceo_name || "" });
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function planIndex(planId: string) {
    return plans.findIndex((p) => p.id === planId);
  }

  function patchFinding(planId: string, idx: number, patch: Partial<CapaFinding>) {
    setPlans((prev) => prev.map((p) => {
      if (p.id !== planId) return p;
      const findings = p.findings.map((f, i) => (i === idx ? { ...f, ...patch } : f));
      return { ...p, findings };
    }));
  }

  async function persistFindings(planId: string, findings: CapaFinding[]) {
    const { error: err } = await supabase.from("internal_audits").update({ findings, updated_at: new Date().toISOString() }).eq("id", planId);
    return err;
  }

  async function handleSave(planId: string, idx: number) {
    const pi = planIndex(planId);
    if (pi < 0) return;
    const plan = plans[pi];
    const key = `${planId}::${idx}`;
    setSavingKey(key);
    const err = await persistFindings(planId, plan.findings);
    setSavingKey(null);
    if (err) return showErr(err.message);
    showMsg("Root cause and actions saved for this finding.");
  }

  async function handleGeneratePdf(planId: string, idx: number) {
    const pi = planIndex(planId);
    if (pi < 0) return;
    const plan = plans[pi];
    const finding = plan.findings[idx];
    const key = `${planId}::${idx}`;
    if (!finding.detail.trim()) return showErr("This finding has no description.");
    if (generatingKey) return;
    setGeneratingKey(key);
    setError("");

    try {
      let ncr = finding.ncr_number;
      if (!ncr) {
        const existing = plans.flatMap((p) => p.findings).map((f) => f.ncr_number || "").filter(Boolean);
        ncr = genNcrNumber(plan.branch_name, existing);
        patchFinding(planId, idx, { ncr_number: ncr });
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;
      let y = margin;

      const logoData = await assetToDataUrl(LOGO);
      embedImage(doc, logoData, (pageWidth - 40) / 2, y, 40, 28);
      y += 42;
      doc.setFontSize(16); doc.setTextColor(15, 23, 42);
      doc.text("CORRECTIVE ACTION & PREVENTIVE ACTION", pageWidth / 2, y, { align: "center" });
      y += 7;
      doc.setFontSize(12); doc.setTextColor(29, 78, 216);
      doc.text("CAPA REPORT", pageWidth / 2, y, { align: "center" });
      y += 8;
      doc.setFontSize(9); doc.setTextColor(100, 116, 139);
      doc.text(`NCR No: ${ncr}`, pageWidth - margin, y, { align: "right" });
      y += 14;

      autoTable(doc, {
        startY: y,
        theme: "grid",
        head: [["Field", "Value"]],
        body: [
          ["NCR / Reference No.", ncr],
          ["Hotel / Branch Name", plan.branch_name || "—"],
          ["Audit Plan", plan.title || "—"],
          ["Plan Document No.", plan.document_number || "—"],
          ["Department", finding.department || "—"],
          ["Risk Rating", finding.type || "—"],
          ["Report Date", formatDDMMYYYY(new Date().toISOString().slice(0, 10))],
        ],
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [29, 78, 216] },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
      });
      y = (doc as any).lastAutoTable.finalY + 12;

      const line = (t: string, size = 10, color: [number, number, number] = [30, 41, 59], gap = 5) => {
        doc.setFontSize(size);
        doc.setTextColor(color[0], color[1], color[2]);
        const wrapped = doc.splitTextToSize(t, maxWidth);
        const above = wrapped.length * size * 0.45 + gap;
        if (y + above > 790) { doc.addPage(); y = margin; }
        doc.text(wrapped, margin, y);
        y += above;
        return y;
      };
      const sectionTitle = (t: string) => {
        if (y > 700) { doc.addPage(); y = margin; }
        doc.setFontSize(12); doc.setTextColor(29, 78, 216);
        doc.text(t, margin, y);
        y += 7;
        doc.setDrawColor(29, 78, 216);
        doc.line(margin, y, pageWidth - margin, y);
        y += 7;
      };
      const bullet = (t: string) => {
        doc.setFontSize(10); doc.setTextColor(30, 41, 59);
        const wrapped = doc.splitTextToSize(`• ${t}`, maxWidth);
        if (y + wrapped.length * 4.5 + 4 > 790) { doc.addPage(); y = margin; }
        doc.text(wrapped, margin, y);
        y += wrapped.length * 4.5 + 2;
      };

      sectionTitle("1. Non-Conformance / Finding");
      (splitLines(finding.detail).length ? splitLines(finding.detail) : [finding.detail]).forEach(bullet);

      sectionTitle("2. Auditor's Observation (How Observed)");
      const obs = finding.observation || finding.detail;
      (splitLines(obs).length ? splitLines(obs) : [obs]).forEach(bullet);

      sectionTitle("3. Root Cause Analysis");
      const rc = splitLines(finding.root_cause || "");
      (rc.length ? rc : ["Not recorded yet."]).forEach(bullet);

      sectionTitle("4. Corrective Action");
      const ca = splitLines(finding.corrective_action || "");
      (ca.length ? ca : ["Not recorded yet."]).forEach(bullet);

      sectionTitle("5. Preventive Action");
      const pa = splitLines(finding.preventive_action || "");
      (pa.length ? pa : ["Not recorded yet."]).forEach(bullet);

      sectionTitle("6. Recommendation");
      (splitLines(finding.recommendation || "").length ? splitLines(finding.recommendation || "") : ["—"]).forEach(bullet);

      if (finding.evidence && finding.evidence.length > 0) {
        sectionTitle("7. Supporting Evidence");
        let row = 0;
        for (const url of finding.evidence) {
          try {
            const dataUrl = await loadImageData(url);
            const w = 70;
            const h = 55;
            if (y + h + 10 > 790) { doc.addPage(); y = margin; }
            const x = margin + (row % 2) * (maxWidth / 2);
            if (y + h > 790) { doc.addPage(); y = margin; row = 0; }
            doc.addImage(dataUrl, "PNG", x, y, w, h);
            row += 1;
            if (row % 2 === 0) y += h + 8;
          } catch { /* image unavailable */ }
        }
        if (row % 2 !== 0) y += 55 + 8;
        if (y > 700) { doc.addPage(); y = margin; }
      }

      y += 6;
      sectionTitle("8. Approval");
      const authorizeName = settings.ceo_name || settings.hr_name || plan.prepared_by || "Authorized Signatory";
      const sigUrl = plan.signature || SIG_DEFAULT;
      if (y + 48 > 790) { doc.addPage(); y = margin; }
      const capaLogo = await assetToDataUrl(LOGO);
      embedImage(doc, capaLogo, margin, y + 4, 34, 24);
      doc.setFontSize(10); doc.setTextColor(30, 41, 59);
      doc.text(`Authorized by: ${authorizeName}`, margin, y + 36);
      const sigData = await assetToDataUrl(sigUrl);
      embedImage(doc, sigData, margin + 90, y, 45, 22);
      doc.setDrawColor(30, 41, 59);
      doc.line(margin, y + 41, margin + 55, y + 41);
      doc.setFontSize(8); doc.setTextColor(100, 116, 139);
      doc.text("Signature", margin, y + 45);

      const blob = doc.output("blob");
      const formData = new FormData();
      formData.append("file", blob, `${sanitizeFile(plan.branch_name)}_CAPA_${sanitizeFile(ncr)}.pdf`);
      formData.append("folderKind", "capa");
      const res = await fetch("/api/drive-upload", { method: "POST", body: formData });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson?.error === "not_connected") return showErr("Connect Google Drive first from the Storage page.");
        return showErr(errJson?.error?.message || "CAPA PDF upload failed.");
      }
      const json = await res.json();
      if (!json.url) return showErr("CAPA PDF upload failed.");

      const updatedFindings = plans[planIndex(planId)].findings.map((f, i) => (
        i === idx ? { ...f, ncr_number: ncr, capa_pdf_url: json.url, capa_pdf_file_id: json.fileId || null } : f
      ));
      const err = await persistFindings(planId, updatedFindings);
      if (err) return showErr(err.message);
      setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, findings: updatedFindings } : p)));
      showMsg(`CAPA report ${ncr} generated and saved to Google Drive.`);
    } catch (e: any) {
      showErr(e?.message || "Could not generate CAPA report.");
    } finally {
      setGeneratingKey(null);
    }
  }

  const branchGroups: { name: string; plans: CapaPlan[] }[] = [];
  const groupMap = new Map<string, CapaPlan[]>();
  plans.forEach((p) => {
    const list = groupMap.get(p.branch_name) || [];
    list.push(p);
    groupMap.set(p.branch_name, list);
  });
  groupMap.forEach((list, name) => branchGroups.push({ name, plans: list }));

  const inputCls = "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/audit" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to Audit Management
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">Root Causes and CAPA</h1>
        <p className="text-blue-200/60 mb-8">For every finding, record the root cause, corrective and preventive actions, then generate a CAPA report (with NCR number) that is saved to your Google Drive — signed at the end for authorization</p>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : plans.length === 0 ? (
          <p className="text-blue-200/40 text-center py-16">No findings yet. Record an audit and generate findings first.</p>
        ) : (
          <div className="space-y-8">
            {branchGroups.map((group) => {
              const totalFindings = group.plans.reduce((n, p) => n + p.findings.length, 0);
              return (
                <div key={group.name}>
                  <h2 className="text-lg font-semibold text-white mb-3">{group.name} <span className="text-xs text-blue-200/40">· {totalFindings} finding{totalFindings !== 1 ? "s" : ""}</span></h2>
                  <div className="space-y-6">
                    {group.plans.map((plan) => {
                      if (plan.findings.length === 0) return null;
                      return (
                        <div key={plan.id} className="space-y-4">
                          <div className="bg-white/[0.04] border border-white/10 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h3 className="text-white font-medium">{plan.title}</h3>
                              <p className="text-xs text-blue-200/40 mt-0.5">{[plan.document_number, plan.date_of_plan, plan.audit_period].filter(Boolean).join(" · ")}</p>
                            </div>
                            <span className="text-xs text-purple-300 bg-purple-500/20 px-2 py-1 rounded-full border border-purple-500/30">{plan.findings.length} finding{plan.findings.length !== 1 ? "s" : ""}</span>
                          </div>

                          {plan.findings.map((f, idx) => {
                            const key = `${plan.id}::${idx}`;
                            const busy = savingKey === key;
                            const genBusy = generatingKey === key;
                            return (
                              <div key={`${plan.id}-${idx}`} className={`bg-white/5 backdrop-blur-sm border rounded-2xl p-5 ${f.capa_pdf_url ? "border-green-500/30" : "border-white/10"}`}>
                                <div className="flex flex-wrap items-center gap-2 mb-4">
                                  <span className={`px-2 py-0.5 text-xs rounded-full border ${sevColor[f.type] || sevColor.Medium}`}>{f.type}</span>
                                  <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200">{f.department}</span>
                                  <span className="text-[10px] uppercase tracking-wide text-blue-200/40">Issue #{String(idx + 1).padStart(2, "0")}</span>
                                  {f.ncr_number && <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-200">{f.ncr_number}</span>}
                                  {f.capa_pdf_url && !genBusy && (
                                    <a href={f.capa_pdf_url} target="_blank" rel="noopener noreferrer" className="ml-auto px-3 py-1.5 text-xs rounded-lg bg-green-600 hover:bg-green-500 text-white">View Saved PDF</a>
                                  )}
                                </div>

                                <div className="space-y-4">
                                  <div>
                                    <span className="block text-xs text-blue-200/60 mb-1">Auditor's Observation (how observed)</span>
                                    <textarea rows={2} value={f.observation || f.detail} onChange={(e) => patchFinding(plan.id, idx, { observation: e.target.value })} className={inputCls} />
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                      <span className="block text-xs text-blue-200/60 mb-1">Root Cause</span>
                                      <textarea rows={4} value={f.root_cause || ""} onChange={(e) => patchFinding(plan.id, idx, { root_cause: e.target.value })} className={inputCls} placeholder="Why did this happen?" />
                                    </div>
                                    <div>
                                      <span className="block text-xs text-blue-200/60 mb-1">Corrective Action</span>
                                      <textarea rows={4} value={f.corrective_action || ""} onChange={(e) => patchFinding(plan.id, idx, { corrective_action: e.target.value })} className={inputCls} placeholder="What will be done to fix it?" />
                                    </div>
                                    <div>
                                      <span className="block text-xs text-blue-200/60 mb-1">Preventive Action</span>
                                      <textarea rows={4} value={f.preventive_action || ""} onChange={(e) => patchFinding(plan.id, idx, { preventive_action: e.target.value })} className={inputCls} placeholder="How will recurrence be prevented?" />
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-4 flex flex-wrap items-center gap-3">
                                  <button onClick={() => handleSave(plan.id, idx)} disabled={busy} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                                    {busy ? "Saving..." : "Save Actions"}
                                  </button>
                                  {!f.capa_pdf_url && (
                                    <button onClick={() => handleGeneratePdf(plan.id, idx)} disabled={genBusy} className="px-4 py-2 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-slate-900 text-sm font-semibold transition-colors disabled:opacity-50">
                                      {genBusy ? "Generating & Saving..." : "Generate CAPA Report"}
                                    </button>
                                  )}
                                  {f.detail && (
                                    <span className="text-xs text-blue-200/50 max-w-md truncate">Finding: {f.detail}</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}