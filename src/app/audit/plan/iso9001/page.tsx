"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { loadPdfImage } from "@/lib/pdf-image";

interface AuditSchedule {
  id: string; branch_id: string; date_from: string; date_to: string;
  auditor: string; status: string; notes: string;
  departments: string[]; branch_name?: string;
}

interface Finding { clause?: string; department?: string; detail: string; type: string; recommendation?: string; resolved?: boolean; }
interface Nonconformity { clause: string; description: string; corrective_action: string; target_date: string; responsible: string; status: string; }

interface AuditPlan {
  id: string; schedule_id: string; title: string;
  scope: string | null; objectives: string | null; criteria: string;
  audit_team: string | null; description: string | null; status: string;
  checklist: { clause: string; item: string; result: string; remark: string }[];
  findings: Finding[]; nonconformities: Nonconformity[];
  overall_result: string; created_at: string;
  document_number: string | null; date_of_plan: string | null; prepared_by: string | null;
  signature: string | null; pdf_url: string | null; pdf_public_id: string | null;
}

const SIG_DEFAULT = "/signature.png";
const LOGO = "/logo.jpg";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sanitizeFile(name: string) {
  return name.replace(/[^a-zA-Z0-9]+/g, "_");
}

function genIsoDocNumber(branchName: string, count: number) {
  const code = (branchName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase() || "QMS");
  return `QMS/ISO/${new Date().getFullYear()}/${code}-${String(count + 1).padStart(3, "0")}`;
}

function loadImageData(url: string): Promise<string> {
  return loadPdfImage(url);
}

const ISO_CLAUSES = [
  { clause: "4", title: "Context of the Organization", items: [
    "4.1 Understanding the organization and its context",
    "4.2 Interested parties and their requirements",
    "4.3 Scope of the QMS",
    "4.4 QMS and its processes",
  ]},
  { clause: "5", title: "Leadership", items: [
    "5.1 Leadership and commitment",
    "5.2 Quality policy",
    "5.3 Organizational roles, responsibilities and authorities",
  ]},
  { clause: "6", title: "Planning", items: [
    "6.1 Actions to address risks and opportunities",
    "6.2 Quality objectives and planning to achieve them",
    "6.3 Planning of changes",
  ]},
  { clause: "7", title: "Support", items: [
    "7.1 Resources (people, infrastructure, environment)",
    "7.2 Competence",
    "7.3 Awareness",
    "7.4 Communication",
    "7.5 Documented information",
  ]},
  { clause: "8", title: "Operation", items: [
    "8.1 Operational planning and control",
    "8.2 Requirements for products and services",
    "8.3 Design and development",
    "8.4 Control of externally provided processes",
    "8.5 Production and service provision",
    "8.6 Release of products and services",
    "8.7 Control of nonconforming outputs",
  ]},
  { clause: "9", title: "Performance Evaluation", items: [
    "9.1 Monitoring, measurement, analysis and evaluation",
    "9.2 Internal audit",
    "9.3 Management review",
  ]},
  { clause: "10", title: "Improvement", items: [
    "10.1 General",
    "10.2 Nonconformity and corrective action",
    "10.3 Continual improvement",
  ]},
];

const SEV_CHIP: Record<string, string> = {
  Critical: "bg-red-500/20 text-red-300",
  High: "bg-orange-500/20 text-orange-200",
  Medium: "bg-amber-500/20 text-amber-300",
  Low: "bg-blue-500/20 text-blue-300",
  Nonconformity: "bg-red-500/20 text-red-300",
  Opportunity: "bg-blue-500/20 text-blue-300",
  Observation: "bg-amber-500/20 text-amber-300",
};

export default function AuditPlanPage() {
  const supabase = createClient();
  const [schedules, setSchedules] = useState<AuditSchedule[]>([]);
  const [plans, setPlans] = useState<AuditPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedSchedule, setSelectedSchedule] = useState<string | null>(null);
  const [planTitle, setPlanTitle] = useState("");
  const [planScope, setPlanScope] = useState("");
  const [planObjectives, setPlanObjectives] = useState("");
  const [planTeam, setPlanTeam] = useState("");
  const [planPreparedBy, setPlanPreparedBy] = useState("");
  const [planDate, setPlanDate] = useState(todayStr());
  const [planDocNum, setPlanDocNum] = useState("");
  const [planSignature, setPlanSignature] = useState("");
  const [pdfSaving, setPdfSaving] = useState(false);

  const [viewingPlan, setViewingPlan] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editScope, setEditScope] = useState("");
  const [editObjectives, setEditObjectives] = useState("");
  const [editTeam, setEditTeam] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [usedInternalScheds, setUsedInternalScheds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: s } = await supabase.from("audit_schedules").select("*, branches(name)").order("date_from");
    const { data: p } = await supabase.from("audit_plans").select("*").order("created_at", { ascending: false });
    const { data: internal } = await supabase.from("internal_audits").select("schedule_id");
    setUsedInternalScheds(new Set((internal || []).map((r: any) => r.schedule_id).filter(Boolean)));
    setSchedules((s || []).map((r: any) => ({
      id: r.id, branch_id: r.branch_id, date_from: r.date_from, date_to: r.date_to,
      auditor: r.auditor, status: r.status, notes: r.notes,
      departments: r.departments || [], branch_name: r.branches?.name || "",
    })));
    setPlans((p || []).map((r: any) => ({
      id: r.id, schedule_id: r.schedule_id, title: r.title,
      scope: r.scope, objectives: r.objectives, criteria: r.criteria || "ISO 9001:2015",
      audit_team: r.auditor_team || r.audit_team, description: r.description, status: r.status,
      checklist: r.checklist || [], findings: r.findings || [],
      nonconformities: r.nonconformities || [], overall_result: r.overall_result || "Open",
      created_at: r.created_at,
      document_number: r.document_number || null, date_of_plan: r.date_of_plan || null,
      prepared_by: r.prepared_by || null, signature: r.signature || null,
      pdf_url: r.pdf_url || null, pdf_public_id: r.pdf_public_id || null,
    })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 3000); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 4000); }

  const scheduleMap = Object.fromEntries(schedules.map((s) => [s.id, s]));
  const plansWithPlan = new Set(plans.map((p) => p.schedule_id).filter(Boolean));
  usedInternalScheds.forEach((id) => plansWithPlan.add(id));
  const availableSchedules = schedules.filter((s) => !plansWithPlan.has(s.id));
  const selectedSched = selectedSchedule ? scheduleMap[selectedSchedule] : null;

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSchedule || !planTitle.trim()) return showErr("Select a schedule and enter a title.");
    const cl: { clause: string; item: string; result: string; remark: string }[] = [];
    ISO_CLAUSES.forEach((c) => c.items.forEach((item) => {
      cl.push({ clause: c.clause, item, result: "", remark: "" });
    }));
    setSaving(true);
    const base = {
      schedule_id: selectedSchedule, title: planTitle.trim(), scope: planScope.trim() || null,
      objectives: planObjectives.trim() || null, criteria: "ISO 9001:2015",
      audit_team: planTeam.trim() || null, description: null, status: "Draft",
      checklist: cl, findings: [], nonconformities: [], overall_result: "Open",
    };
    let { error } = await supabase.from("audit_plans").insert({
      ...base,
      document_number: planDocNum.trim() || null, date_of_plan: planDate || null,
      prepared_by: planPreparedBy.trim() || null, signature: planSignature || null,
    });
    if (error && /document_number|prepared_by|date_of_plan|signature|column/i.test(error.message)) {
      ({ error } = await supabase.from("audit_plans").insert(base));
    }
    setSaving(false);
    if (error) return showErr(error.message);
    setPlanTitle(""); setPlanScope(""); setPlanObjectives(""); setPlanTeam("");
    setPlanPreparedBy(""); setPlanDocNum(""); setPlanSignature("");
    setSelectedSchedule(null);
    showMsg("Audit plan created.");
    fetchData();
  }

  async function handleDeletePlan(id: string) {
    const { error } = await supabase.from("audit_plans").delete().eq("id", id);
    if (error) return showErr(error.message);
    showMsg("Plan deleted.");
    fetchData();
  }

  function startEdit(plan: AuditPlan) {
    setEditingPlan(plan.id);
    setEditTitle(plan.title);
    setEditScope(plan.scope || "");
    setEditObjectives(plan.objectives || "");
    setEditTeam(plan.audit_team || "");
    setViewingPlan(null);
  }

  async function handleSaveEdit(id: string) {
    setSaving(true);
    const { error } = await supabase.from("audit_plans").update({
      title: editTitle.trim(), scope: editScope.trim() || null, objectives: editObjectives.trim() || null,
      audit_team: editTeam.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    setSaving(false);
    if (error) return showErr(error.message);
    setEditingPlan(null); setViewingPlan(id);
    showMsg("Plan updated.");
    fetchData();
  }

  async function onSignatureUpload(file: File | null) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return showErr("Signature image must be under 2MB.");
    const reader = new FileReader();
    reader.onload = () => setPlanSignature(String(reader.result));
    reader.readAsDataURL(file);
  }

  function onSchedulePicked(id: string) {
    setSelectedSchedule(id || null);
    if (!planDocNum) {
      const sched = scheduleMap[id || ""];
      if (sched?.branch_name) setPlanDocNum(genIsoDocNumber(sched.branch_name, plans.length));
    }
  }

  async function generatePdf(plan: AuditPlan) {
    setPdfSaving(true);
    setError("");
    try {
      const sched = scheduleMap[plan.schedule_id];
      const branchName = sched?.branch_name || "—";
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;
      let y = margin;

      try {
        const logoUrl = await loadImageData(LOGO);
        const logoW = 40;
        const logoH = 28;
        doc.addImage(logoUrl, "JPEG", (pageWidth - logoW) / 2, y, logoW, logoH);
      } catch { /* logo unavailable */ }

      y += 42;
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.text("ISO 9001 AUDIT PLAN", pageWidth / 2, y, { align: "center" });
      y += 10;

      const line = (t: string, size = 10, color: [number, number, number] = [30, 41, 59], gap = 5) => {
        doc.setFontSize(size);
        doc.setTextColor(color[0], color[1], color[2]);
        const lines = doc.splitTextToSize(t, maxWidth);
        doc.text(lines, margin, y);
        y += (lines.length * size * 0.45) + gap;
        return y;
      };
      const sectionTitle = (t: string) => {
        doc.setFontSize(12);
        doc.setTextColor(29, 78, 216);
        doc.text(t, margin, y);
        y += 7;
        doc.setDrawColor(29, 78, 216);
        doc.line(margin, y, pageWidth - margin, y);
        y += 7;
      };

      autoTable(doc, {
        startY: y,
        theme: "grid",
        head: [["Field", "Value"]],
        body: [
          ["Branch Name", branchName],
          ["Audit Title", plan.title || "—"],
          ["Document Number", plan.document_number || "—"],
          ["Audit Period", sched ? `${sched.date_from} to ${sched.date_to}` : "—"],
          ["Date of Plan", plan.date_of_plan || "—"],
          ["Prepared by", plan.prepared_by || "—"],
          ["Criteria", plan.criteria || "ISO 9001:2015"],
        ],
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [29, 78, 216] },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
      });
      y = (doc as any).lastAutoTable.finalY + 12;

      sectionTitle("1. Scope");
      line(plan.scope || "—", 10, [51, 65, 85]);

      sectionTitle("2. Objectives");
      line(plan.objectives || "—", 10, [51, 65, 85]);

      sectionTitle("3. Audit Team");
      line(plan.audit_team || "—", 10, [51, 65, 85]);

      sectionTitle("4. ISO 9001:2015 Clause Checklist");
      if (y > 760) { doc.addPage(); y = margin; }
      autoTable(doc, {
        startY: y,
        theme: "grid",
        head: [["Clause", "Requirement"]],
        body: plan.checklist.length
          ? plan.checklist.map((c) => [c.clause, c.item])
          : ISO_CLAUSES.flatMap((c) => c.items.map((item) => [c.clause, item])),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [29, 78, 216] },
        columnStyles: { 0: { cellWidth: 22 } },
      });
      y = (doc as any).lastAutoTable.finalY + 12;

      if (plan.findings.length > 0) {
        sectionTitle("5. Findings");
        if (y > 760) { doc.addPage(); y = margin; }
        autoTable(doc, {
          startY: y,
          theme: "grid",
          head: [["Department", "Clause", "Severity", "Detail"]],
          body: plan.findings.map((f) => [f.department || "General", f.clause || "—", f.type, f.detail]),
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [29, 78, 216] },
          columnStyles: { 3: { cellWidth: 90 } },
        });
        y = (doc as any).lastAutoTable.finalY + 12;
      }

      if (plan.nonconformities.length > 0) {
        sectionTitle("6. Nonconformities & Corrective Actions");
        if (y > 760) { doc.addPage(); y = margin; }
        autoTable(doc, {
          startY: y,
          theme: "grid",
          head: [["Clause", "Description", "Action", "Responsible", "Target", "Status"]],
          body: plan.nonconformities.map((nc) => [nc.clause, nc.description, nc.corrective_action || "—", nc.responsible || "—", nc.target_date || "—", nc.status || "—"]),
          styles: { fontSize: 7.5, cellPadding: 2 },
          headStyles: { fillColor: [29, 78, 216] },
        });
        y = (doc as any).lastAutoTable.finalY + 12;
      }

      sectionTitle("7. Confidentiality");
      line("All information obtained during this audit will be treated as confidential and used solely for audit and improvement purposes.", 10, [51, 65, 85]);

      if (y > 700) { doc.addPage(); y = margin; }
      y += 8;
      doc.setFontSize(10); doc.setTextColor(51, 65, 85);
      doc.text(`Prepared by: ${plan.prepared_by || "_______________"}`, margin, y);
      doc.text(`Date: ${plan.date_of_plan || "____________"}`, pageWidth - margin, y, { align: "right" });
      y += 14;
      doc.text("Signature:", margin, y);
      const sigUrl = plan.signature || SIG_DEFAULT;
      try {
        const dataUrl = await loadImageData(sigUrl);
        doc.addImage(dataUrl, "JPEG", margin + 20, y - 8, 45, 22);
      } catch { /* signature image unavailable */ }

      const blob = doc.output("blob");
      const formData = new FormData();
      formData.append("file", blob, `${sanitizeFile(branchName)}_ISO_Audit_Plan.pdf`);
      const res = await fetch("/api/drive-upload", { method: "POST", body: formData });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson?.error === "not_connected") return showErr("Connect Google Drive first from the Storage page.");
        return showErr(typeof errJson?.error === "string" ? errJson.error : "PDF upload failed.");
      }
      const json = await res.json();
      if (!json.url) return showErr("PDF upload failed.");

      const { error: updErr } = await supabase
        .from("audit_plans")
        .update({ pdf_url: json.url, pdf_public_id: json.fileId || null, updated_at: new Date().toISOString() })
        .eq("id", plan.id);
      if (updErr) {
        if (updErr.message.includes("pdf_url") || updErr.message.includes("column")) {
          return showErr("PDF saved to Google Drive, but the audit_plans table is missing PDF columns. Run the ISO PDF migration in Supabase (see repo supabase/migrations).");
        }
        return showErr(updErr.message);
      }
      showMsg("ISO 9001 audit plan PDF saved to Google Drive.");
      fetchData();
    } catch (e: any) {
      showErr(e?.message || "Could not generate PDF.");
    } finally {
      setPdfSaving(false);
    }
  }

  function renderPlainClauses() {
    return (
      <div className="space-y-3">
        {ISO_CLAUSES.map((clause) => (
          <div key={clause.clause} className="border border-white/5 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-white/[0.03]">
              <span className="text-white font-medium text-sm">Clause {clause.clause}: {clause.title}</span>
            </div>
            <div className="px-4 py-2">
              {clause.items.map((item) => (
                <div key={item} className="py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-sm text-white/70">{item}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderPlanView(plan: AuditPlan) {
    return (
      <div className="p-6">
        {plan.findings.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-amber-200">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              Findings are already recorded for this audit, so it can&apos;t be recorded again.
            </div>
            <Link href="/audit/findings" className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-medium transition-colors">
              Go to Findings &amp; Evidences to add more NCRs
            </Link>
          </div>
        )}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-white">{plan.title}</h3>
            {plan.overall_result && <span className={`mt-1 inline-block px-2 py-0.5 text-xs rounded-full ${plan.overall_result === "Closed" ? "bg-green-500/20 text-green-300" : plan.overall_result === "Significant NC" ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}`}>{plan.overall_result}</span>}
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <button onClick={() => startEdit(plan)} className="text-xs text-blue-300 hover:text-white">Edit</button>
            <button onClick={() => { if (confirm("Delete?")) handleDeletePlan(plan.id); }} className="text-xs text-red-400 hover:text-red-300">Delete</button>
            {plan.pdf_url ? (
              <a href={plan.pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg">View PDF</a>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); generatePdf(plan); }} disabled={pdfSaving} className="text-xs bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg">
                {pdfSaving ? "Saving..." : "Save to Google Drive"}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
          {plan.scope && <div><span className="text-blue-200/50">Scope: </span><span className="text-white/80">{plan.scope}</span></div>}
          {plan.objectives && <div><span className="text-blue-200/50">Objectives: </span><span className="text-white/80">{plan.objectives}</span></div>}
          {plan.audit_team && <div><span className="text-blue-200/50">Audit Team: </span><span className="text-white/80">{plan.audit_team}</span></div>}
          <div><span className="text-blue-200/50">Criteria: </span><span className="text-white/80">{plan.criteria}</span></div>
        </div>

        <h4 className="text-sm font-semibold text-white mb-3">Scope of the Audit: ISO 9001:2015 Clauses</h4>
        {renderPlainClauses()}

        {plan.findings && plan.findings.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-white mb-3">Findings</h4>
            <div className="space-y-2">
              {plan.findings.map((f, i) => (
                <div key={i} className="p-3 bg-white/5 rounded-lg flex items-start gap-3">
                  <span className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${SEV_CHIP[f.type] || "bg-amber-500/20 text-amber-300"}`}>{f.type}</span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {f.clause && <span className="text-xs text-blue-200/50">Clause {f.clause}</span>}
                      {f.department && <span className="text-xs text-purple-200/70">{f.department}</span>}
                    </div>
                    <p className="text-sm text-white/80">{f.detail}</p>
                    {f.recommendation && <p className="text-xs text-blue-200/50 mt-1">Recommendation: {f.recommendation}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {plan.nonconformities && plan.nonconformities.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-white mb-3">Nonconformities & Corrective Actions</h4>
            <div className="space-y-2">
              {plan.nonconformities.map((nc, i) => (
                <div key={i} className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-red-300 font-medium">Clause {nc.clause}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${nc.status === "Closed" ? "bg-green-500/20 text-green-300" : "bg-amber-500/20 text-amber-300"}`}>{nc.status}</span>
                  </div>
                  <p className="text-white/80 mb-1">{nc.description}</p>
                  {nc.corrective_action && <p className="text-xs text-blue-200/50">Action: {nc.corrective_action}</p>}
                  <div className="flex gap-4 text-xs text-blue-200/40 mt-1">
                    {nc.target_date && <span>Target: {nc.target_date}</span>}
                    {nc.responsible && <span>Responsible: {nc.responsible}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderPlanEdit(plan: AuditPlan) {
    return (
      <div className="p-6">
        <div className="mb-4">
          <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full px-3 py-2 bg-white/10 border border-blue-500 rounded-lg text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs text-blue-200/50 mb-1 block">Scope</label>
            <input type="text" value={editScope} onChange={(e) => setEditScope(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-blue-200/50 mb-1 block">Objectives</label>
            <input type="text" value={editObjectives} onChange={(e) => setEditObjectives(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs text-blue-200/50 mb-1 block">Audit Team</label>
            <input type="text" value={editTeam} onChange={(e) => setEditTeam(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        {renderPlainClauses()}
        <div className="flex gap-2 mt-4">
          <button onClick={() => handleSaveEdit(plan.id)} disabled={saving} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors">{saving ? "Saving..." : "Save"}</button>
          <button onClick={() => { setEditingPlan(null); setViewingPlan(plan.id); }} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/audit/plan" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to Audit Plans
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">ISO 9001 Audit Plan</h1>
        <p className="text-blue-200/60 mb-8">Create audit plans based on ISO 9001:2015 requirements</p>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-10">
          <h2 className="text-lg font-semibold text-white mb-4">Create New ISO 9001 Audit Plan</h2>
          <form onSubmit={handleCreatePlan}>
            <div className="mb-4">
              <label className="block text-sm text-blue-200/70 mb-1">Select Branch Schedule</label>
              <select value={selectedSchedule || ""} onChange={(e) => onSchedulePicked(e.target.value)} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]">
                <option value="" className="bg-slate-800">Choose a branch schedule...</option>
                {availableSchedules.map((s) => (<option key={s.id} value={s.id} className="bg-slate-800">{s.branch_name} ({s.date_from} → {s.date_to})</option>))}
              </select>
              {selectedSched && selectedSched.departments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedSched.departments.map((d, i) => (<span key={i} className="px-2 py-1 text-xs bg-blue-500/20 text-blue-300 rounded-full">{d}</span>))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-blue-200/70 mb-1">Audit Title</label>
                <input type="text" value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} placeholder="e.g. Q2 Kitchen Audit" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-blue-200/70 mb-1">Audit Team</label>
                <input type="text" value={planTeam} onChange={(e) => setPlanTeam(e.target.value)} placeholder="Auditor names" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm text-blue-200/70 mb-1">Prepared by</label>
                <input type="text" value={planPreparedBy} onChange={(e) => setPlanPreparedBy(e.target.value)} placeholder="Auditor name" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-blue-200/70 mb-1">Date of Plan</label>
                <input type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]" />
              </div>
              <div>
                <label className="block text-sm text-blue-200/70 mb-1">Document Number</label>
                <input type="text" value={planDocNum} onChange={(e) => setPlanDocNum(e.target.value)} placeholder="Auto-fills from branch" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-blue-200/70 mb-1">Signature (optional — default uses your saved signature)</label>
              <input type="file" accept="image/*" onChange={(e) => onSignatureUpload(e.target.files?.[0] || null)} className="text-sm text-white/60 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-sm file:font-medium hover:file:bg-blue-500" />
              {planSignature && (
                <div className="mt-2 flex items-center gap-3">
                  <img src={planSignature} alt="Signature" className="h-12" />
                  <button type="button" onClick={() => setPlanSignature("")} className="text-xs text-red-400 hover:text-red-300">Reset to default</button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-blue-200/70 mb-1">Scope</label>
                <input type="text" value={planScope} onChange={(e) => setPlanScope(e.target.value)} placeholder="Area or process being audited" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-blue-200/70 mb-1">Objectives</label>
                <input type="text" value={planObjectives} onChange={(e) => setPlanObjectives(e.target.value)} placeholder="What the audit aims to achieve" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <p className="text-xs text-blue-200/40 mb-3">Criteria: <strong className="text-white/60">ISO 9001:2015</strong></p>

            <div className="mb-4">
              {renderPlainClauses()}
            </div>

            <div className="flex justify-end">
              <button type="submit" disabled={saving} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition-all duration-200 shadow-lg shadow-blue-600/25">
                {saving ? "Creating..." : "Create Audit Plan"}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h2 className="text-lg font-semibold text-white">Audit Plans</h2>
          </div>
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : plans.length === 0 ? (
            <p className="text-blue-200/40 text-center py-8">No plans created yet.</p>
          ) : (
            plans.map((plan) => {
              const sched = scheduleMap[plan.schedule_id];
              return (
                <div key={plan.id} className="border-b border-white/5 last:border-0">
                  {editingPlan === plan.id ? (
                    renderPlanEdit(plan)
                  ) : viewingPlan === plan.id ? (
                    <div>
                      <div className="flex justify-end px-6 pt-4">
                        <button onClick={() => setViewingPlan(null)} className="text-xs text-blue-300 hover:text-white">Collapse</button>
                      </div>
                      {renderPlanView(plan)}
                    </div>
                  ) : (
                    <button onClick={() => setViewingPlan(viewingPlan === plan.id ? null : plan.id)} className="w-full px-6 py-4 text-left hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-white font-semibold">{plan.title}</h3>
                            <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-200">ISO 9001</span>
                            <span className={`px-2 py-0.5 text-xs rounded-full ${plan.overall_result === "Closed" ? "bg-green-500/20 text-green-300" : plan.overall_result === "Significant NC" ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}`}>{plan.overall_result}</span>
                          </div>
                          {sched && <p className="text-xs text-blue-200/50 mt-1">{sched.branch_name} · {sched.date_from} → {sched.date_to}{plan.audit_team ? ` · Team: ${plan.audit_team}` : ""}</p>}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-blue-200/50">{plan.findings.length} finding{plan.findings.length !== 1 ? "s" : ""}</span>
                          <div className="flex gap-2">
                            <button onClick={(e) => { e.stopPropagation(); startEdit(plan); }} className="text-xs text-blue-300 hover:text-white">Edit</button>
                            <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete?")) handleDeletePlan(plan.id); }} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                          </div>
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}