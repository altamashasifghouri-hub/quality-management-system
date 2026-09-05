"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface Department { id: string; name: string; branch_id: string; }
interface Branch { id: string; name: string; departments: Department[]; }
interface AuditSchedule { id: string; branch_id: string; date_from: string; date_to: string; departments: string[]; }

type Severity = "Critical" | "High" | "Medium" | "Low";
interface Finding { department: string; type: Severity; detail: string; }
interface ProgramRow { department: string; duration: string; }

interface InternalAudit {
  id: string;
  title: string;
  document_number: string | null;
  branch_id: string;
  branch_name?: string;
  schedule_id: string | null;
  departments: string[];
  audit_team: string | null;
  findings: Finding[];
  status: string;
  created_at: string;
  audit_period: string | null;
  plan_version: string | null;
  prepared_by: string | null;
  date_of_plan: string | null;
  purpose: string | null;
  period_covered: string | null;
  locations_covered: string | null;
  exclusions: string | null;
  approach: string[];
  program: ProgramRow[];
  signature: string | null;
  pdf_url: string | null;
  pdf_public_id: string | null;
}

interface PlanForm {
  title: string;
  document_number: string;
  branch_id: string;
  schedule_id: string;
  audit_period: string;
  plan_version: string;
  prepared_by: string;
  date_of_plan: string;
  purpose: string;
  period_covered: string;
  locations_covered: string;
  exclusions: string;
  team: string;
  departments: string[];
  approach: string[];
  program: Record<string, string>;
  signature: string;
}

const APPROACH_ITEMS = [
  "Risk-based approach",
  "Document review and policy testing",
  "Process walkthroughs and observations",
  "Sample testing (statistical / judgmental)",
  "Data analytics from PMS, POS and accounting systems",
  "Surprise cash counts and inventory counts",
  "Staff interviews",
  "Physical verification of assets and security controls",
];

const REPORTING_TEXT = [
  "Findings will be classified as: Critical / High / Medium / Low",
  "Draft report will be discussed in the Closing Meeting with Branch Manager and will be sent on the same day to Management without delay.",
  "Management responses and action plans will be required within 5 working days.",
  "Follow-up verification will be conducted within 10 working days of final report issuance.",
];

const INDEPENDENCE_TEXT =
  "The Internal Audit team confirms independence from the operations under review. All information obtained during the audit will be treated as confidential and used solely for audit purposes.";

const SIG_DEFAULT = "/signature.png";
const LOGO = "/logo.jpg";

const statusBadge = (status: string) =>
  status === "Completed"
    ? "bg-green-500/20 text-green-300"
    : status === "In Progress"
    ? "bg-amber-500/20 text-amber-300"
    : "bg-white/10 text-blue-200/70";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sanitizeFile(name: string) {
  return name.replace(/[^a-zA-Z0-9]+/g, "_");
}

function genDocNumber(branchName: string, count: number) {
  const code = (branchName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase() || "QMS");
  return `QMS/IA/${new Date().getFullYear()}/${code}-${String(count + 1).padStart(3, "0")}`;
}

const emptyForm = (): PlanForm => ({
  title: "", document_number: "", branch_id: "", schedule_id: "", audit_period: "", plan_version: "",
  prepared_by: "", date_of_plan: todayStr(),
  purpose: "", period_covered: "", locations_covered: "", exclusions: "",
  team: "", departments: [], approach: [...APPROACH_ITEMS], program: {}, signature: "",
});

export default function InternalAuditPlan() {
  const supabase = createClient();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [schedules, setSchedules] = useState<AuditSchedule[]>([]);
  const [plans, setPlans] = useState<InternalAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [pdfSaving, setPdfSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PlanForm>(emptyForm());
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [usedIsoScheds, setUsedIsoScheds] = useState<Set<string>>(new Set());

  const [viewingPlan, setViewingPlan] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 3000); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 4000); }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: branchData } = await supabase.from("branches").select("*").order("created_at", { ascending: true });
    const { data: deptData } = await supabase.from("departments").select("*").order("created_at", { ascending: true });
    const { data: schedData } = await supabase.from("audit_schedules").select("*").order("date_from", { ascending: true });
    const { data: planData } = await supabase.from("internal_audits").select("*").order("created_at", { ascending: false });
    const { data: isoPlanData } = await supabase.from("audit_plans").select("schedule_id");
    setUsedIsoScheds(new Set((isoPlanData || []).map((r: any) => r.schedule_id).filter(Boolean)));

    const deptMap = new Map<string, Department[]>();
    (deptData || []).forEach((d: any) => {
      const list = deptMap.get(d.branch_id) || [];
      list.push({ id: d.id, name: d.name, branch_id: d.branch_id });
      deptMap.set(d.branch_id, list);
    });
    const br = (branchData || []).map((b: any) => ({ id: b.id, name: b.name, departments: deptMap.get(b.id) || [] }));
    const branchName = new Map(br.map((b) => [b.id, b.name]));
    setBranches(br);
    setSchedules((schedData || []).map((s: any) => ({
      id: s.id, branch_id: s.branch_id, date_from: s.date_from, date_to: s.date_to, departments: s.departments || [],
    })));
    setPlans((planData || []).map((p: any) => ({
      id: p.id, title: p.title, document_number: p.document_number, branch_id: p.branch_id,
      branch_name: branchName.get(p.branch_id) || "",
      schedule_id: p.schedule_id, departments: p.departments || [], audit_team: p.audit_team,
      findings: p.findings || [], status: p.status || "Draft", created_at: p.created_at,
      audit_period: p.audit_period, plan_version: p.plan_version, prepared_by: p.prepared_by,
      date_of_plan: p.date_of_plan,
      purpose: p.purpose, period_covered: p.period_covered, locations_covered: p.locations_covered,
      exclusions: p.exclusions, approach: p.approach || [], program: p.program || [],
      signature: p.signature, pdf_url: p.pdf_url, pdf_public_id: p.pdf_public_id,
    })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selBranch = branches.find((b) => b.id === form.branch_id);
  const editingSchedId = editingPlan ? (plans.find((p) => p.id === editingPlan)?.schedule_id || null) : null;
  const occupiedScheduleIds = new Set<string>();
  plans.forEach((p) => { if (p.schedule_id && p.id !== editingPlan) occupiedScheduleIds.add(p.schedule_id); });
  usedIsoScheds.forEach((id) => { if (id !== editingSchedId) occupiedScheduleIds.add(id); });
  const branchSchedules = form.branch_id
    ? schedules.filter((s) => s.branch_id === form.branch_id && !occupiedScheduleIds.has(s.id))
    : [];
  const selSchedule = form.schedule_id ? schedules.find((s) => s.id === form.schedule_id) : null;

  function setF(patch: Partial<PlanForm>) { setForm((prev) => ({ ...prev, ...patch })); }

  function onBranchChange(id: string) {
    const branch = branches.find((b) => b.id === id);
    const docNumber = !form.document_number && branch ? genDocNumber(branch.name, plans.length) : form.document_number;
    setF({
      branch_id: id, schedule_id: "", departments: [], document_number: docNumber,
      purpose: branch
        ? `The purpose of this internal audit is to evaluate the adequacy and effectiveness of internal controls, safeguard assets, ensure compliance with company policies, brand standards and applicable laws, and identify opportunities for operational improvement at ${branch.name}.`
        : "",
    });
  }

  function onScheduleChange(id: string) {
    const sched = schedules.find((s) => s.id === id);
    if (!sched) return setF({ schedule_id: "", departments: [] });
    const period = `${sched.date_from} to ${sched.date_to}`;
    setF({ schedule_id: id, departments: sched.departments || [], audit_period: period, period_covered: period });
  }

  function toggleDept(dept: string) {
    setF({ departments: form.departments.includes(dept) ? form.departments.filter((d) => d !== dept) : [...form.departments, dept] });
  }

  function toggleApproach(item: string) {
    setF({ approach: form.approach.includes(item) ? form.approach.filter((a) => a !== item) : [...form.approach, item] });
  }

  async function onSignatureUpload(file: File | null) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return showErr("Signature image must be under 2MB.");
    const reader = new FileReader();
    reader.onload = () => setF({ signature: String(reader.result) });
    reader.readAsDataURL(file);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return showErr("Enter an Audit Title.");
    if (!form.branch_id) return showErr("Select a Branch.");
    if (!form.schedule_id) return showErr("An audit must be scheduled in the calendar first. Select a schedule.");
    if (occupiedScheduleIds.has(form.schedule_id)) return showErr("That schedule already has an audit plan (Internal or ISO 9001) — only one plan per schedule.");
    if (form.departments.length === 0) return showErr("Select at least one department.");
    if (!form.prepared_by.trim()) return showErr("Enter Prepared by.");
    if (!form.date_of_plan) return showErr("Enter Date of Plan.");

    const program: ProgramRow[] = form.departments.map((dept) => ({
      department: dept, duration: form.program[dept]?.trim() || "",
    }));

    setSaving(true);
    const payload = {
      title: form.title.trim(), document_number: form.document_number.trim() || null,
      branch_id: form.branch_id, schedule_id: form.schedule_id,
      departments: form.departments, audit_team: form.team.trim() || null,
      audit_period: form.audit_period.trim() || null, plan_version: form.plan_version.trim() || null,
      prepared_by: form.prepared_by.trim() || null, date_of_plan: form.date_of_plan || null,
      purpose: form.purpose.trim() || null, period_covered: form.period_covered.trim() || null,
      locations_covered: form.locations_covered.trim() || null, exclusions: form.exclusions.trim() || null,
      approach: form.approach, program, signature: form.signature || null,
      findings: [], status: "Draft",
    };
    let errRes = null as { message?: string } | null;
    if (editingPlan) {
      const { error } = await supabase.from("internal_audits").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingPlan);
      errRes = error;
    } else {
      const { error } = await supabase.from("internal_audits").insert(payload);
      errRes = error;
    }
    setSaving(false);
    if (errRes?.message) return showErr(errRes.message);
    const savedId = editingPlan;
    setShowForm(false); setEditingPlan(null); setForm(emptyForm());
    showMsg(editingPlan ? "Plan updated." : "Plan created.");
    fetchData();
    setTimeout(() => { if (savedId) setViewingPlan(savedId); }, 300);
  }

  async function handleDelete(id: string) {
    const { error: err } = await supabase.from("internal_audits").delete().eq("id", id);
    if (err) return showErr(err.message);
    showMsg("Plan deleted.");
    setViewingPlan(null); setEditingPlan(null);
    fetchData();
  }

  function startEdit(plan: InternalAudit) {
    const program: Record<string, string> = {};
    plan.program.forEach((row) => { program[row.department] = row.duration; });
    setForm({
      title: plan.title, document_number: plan.document_number || "",
      branch_id: plan.branch_id, schedule_id: plan.schedule_id || "",
      audit_period: plan.audit_period || "", plan_version: plan.plan_version || "",
      prepared_by: plan.prepared_by || "", date_of_plan: plan.date_of_plan || todayStr(),
      purpose: plan.purpose || "", period_covered: plan.period_covered || "",
      locations_covered: plan.locations_covered || "", exclusions: plan.exclusions || "",
      team: plan.audit_team || "", departments: plan.departments,
      approach: plan.approach.length ? plan.approach : [...APPROACH_ITEMS],
      program, signature: plan.signature || "",
    });
    setEditingPlan(plan.id); setViewingPlan(null); setShowForm(true);
  }

  const viewPlan = viewingPlan ? plans.find((p) => p.id === viewingPlan) : null;

  const inputCls = "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark] w-full";
  const selectCls = "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark] w-full";
  const labelCls = "block text-sm text-blue-200/60 mb-1";

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

  async function generatePdf(plan: InternalAudit) {
    setDownloadingPdf(true);
    setError("");
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;
      let y = margin;

      try {
        const logoUrl = await loadImageData(LOGO);
        const logoW = 40;
        const logoH = 28;
        doc.addImage(logoUrl, "PNG", (pageWidth - logoW) / 2, y, logoW, logoH);
      } catch { /* logo unavailable */ }

      y += 42;
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.text("INTERNAL AUDIT PLAN", pageWidth / 2, y, { align: "center" });
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
          ["Branch Name", plan.branch_name || "—"],
          ["Audit Title", plan.title || "—"],
          ["Document Number", plan.document_number || "—"],
          ["Audit Period", plan.audit_period || "—"],
          ["Plan Version", plan.plan_version || "—"],
          ["Prepared by", plan.prepared_by || "—"],
          ["Date of Plan", plan.date_of_plan || "—"],
        ],
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [29, 78, 216] },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
      });
      y = (doc as any).lastAutoTable.finalY + 12;

      sectionTitle("1. Purpose of the Audit");
      line(plan.purpose || "—", 10, [51, 65, 85]);

      sectionTitle("2. Scope of the Audit");
      doc.setFontSize(10); doc.setTextColor(51, 65, 85);
      doc.text("Included Areas:", margin, y);
      y += 6;
      const areas = plan.departments.length ? plan.departments.join(", ") : "—";
      const areaLines = doc.splitTextToSize(areas, maxWidth - 8);
      doc.setTextColor(30, 41, 59);
      doc.text(areaLines, margin + 8, y);
      y += areaLines.length * 4.5 + 4;
      doc.setTextColor(51, 65, 85);
      doc.text(`Period Covered: ${plan.period_covered || "—"}`, margin, y); y += 6;
      doc.text("Locations Covered:", margin, y); y += 6;
      doc.setTextColor(30, 41, 59);
      doc.text(doc.splitTextToSize(plan.locations_covered || "—", maxWidth), margin + 8, y);
      y += 4.5 + 4;
      doc.setTextColor(51, 65, 85);
      doc.text("Exclusions:", margin, y); y += 6;
      doc.setTextColor(30, 41, 59);
      doc.text(doc.splitTextToSize(plan.exclusions || "None", maxWidth), margin + 8, y);
      y += 8;

      sectionTitle("3. Audit Approach & Methodology");
      doc.setFontSize(10); doc.setTextColor(30, 41, 59);
      (plan.approach.length ? plan.approach : APPROACH_ITEMS).forEach((item) => {
        if (y > 780) { doc.addPage(); y = margin; }
        const wrapped = doc.splitTextToSize(`• ${item}`, maxWidth);
        doc.text(wrapped, margin, y);
        y += wrapped.length * 4.5 + 2;
      });
      y += 4;

      sectionTitle("4. Detailed Audit Program (Summary)");
      if (y > 760) { doc.addPage(); y = margin; }
      autoTable(doc, {
        startY: y,
        theme: "grid",
        head: [["Department", "Duration / Time"]],
        body: (plan.program.length ? plan.program : plan.departments.map((d) => ({ department: d, duration: "" }))).map((r) => [r.department, r.duration || "—"]),
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [29, 78, 216] },
      });
      y = (doc as any).lastAutoTable.finalY + 12;

      sectionTitle("5. Audit Team & Resources");
      line(`Internal Auditor(s): ${plan.audit_team || "—"}`, 10, [51, 65, 85]);

      sectionTitle("6. Reporting & Follow-up");
      doc.setFontSize(10); doc.setTextColor(30, 41, 59);
      REPORTING_TEXT.forEach((item) => {
        if (y > 780) { doc.addPage(); y = margin; }
        const wrapped = doc.splitTextToSize(`• ${item}`, maxWidth);
        doc.text(wrapped, margin, y);
        y += wrapped.length * 4.5 + 2;
      });
      y += 4;

      if (plan.findings.length > 0) {
        sectionTitle("Findings");
        if (y > 760) { doc.addPage(); y = margin; }
        autoTable(doc, {
          startY: y,
          theme: "grid",
          head: [["Department", "Severity", "Detail"]],
          body: plan.findings.map((f) => [f.department, f.type, f.detail]),
          styles: { fontSize: 9, cellPadding: 2.5 },
          headStyles: { fillColor: [29, 78, 216] },
          columnStyles: { 2: { cellWidth: 90 } },
        });
        y = (doc as any).lastAutoTable.finalY + 12;
      }

      sectionTitle("10. Independence & Confidentiality Statement");
      line(INDEPENDENCE_TEXT, 10, [51, 65, 85]);

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
        doc.addImage(dataUrl, "PNG", margin + 20, y - 8, 45, 22);
      } catch { /* signature image unavailable */ }

      setPdfSaving(true);
      try {
        const blob = doc.output("blob");
        const formData = new FormData();
        formData.append("file", blob, `${sanitizeFile(plan.branch_name || "Internal")}_Audit_Plan.pdf`);
        const res = await fetch("/api/drive-upload", { method: "POST", body: formData });
        if (res.ok) {
          const json = await res.json();
          if (json.url) {
            const { error: updErr } = await supabase
              .from("internal_audits")
              .update({ pdf_url: json.url, pdf_public_id: json.fileId || null, updated_at: new Date().toISOString() })
              .eq("id", plan.id);
            if (!updErr) {
              showMsg("PDF generated and saved to Google Drive.");
              fetchData();
            }
          }
        } else {
          const errJson = await res.json().catch(() => ({}));
          if (errJson?.error === "not_connected") {
            showErr("Connect Google Drive first from the Storage page.");
          } else {
            showErr(errJson?.error?.message || "PDF generated but upload failed.");
          }
        }
      } catch {
        showErr("PDF generated but upload failed.");
      } finally {
        setPdfSaving(false);
      }
    } catch (e: any) {
      showErr(e?.message || "Could not generate PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/audit/plan" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to Audit Plan
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Internal Standard</h1>
            <p className="text-blue-200/60">Internal audit plans across branch departments and findings</p>
          </div>
          <button
            onClick={() => { setShowForm((v) => !v); setEditingPlan(null); setForm(emptyForm()); }}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            {showForm ? "Cancel" : "+ New Internal Plan"}
          </button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

        {showForm && (
          <form onSubmit={handleCreate} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-8 space-y-5">
            <h2 className="text-xl font-bold text-white">{editingPlan ? "Edit Internal Audit Plan" : "New Internal Audit Plan"}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Branch Name *</label>
                <select value={form.branch_id} onChange={(e) => onBranchChange(e.target.value)} className={selectCls}>
                  <option value="">Select branch</option>
                  {branches.map((b) => (<option key={b.id} value={b.id} className="bg-slate-800">{b.name}</option>))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Audit Title *</label>
                <input value={form.title} onChange={(e) => setF({ title: e.target.value })} placeholder="e.g. Kitchen & Warehousing Internal Audit" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Document Number *</label>
                <input value={form.document_number} onChange={(e) => setF({ document_number: e.target.value })} placeholder="e.g. QMS/IA/2026/FSL-001" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Audit Period</label>
                <input value={form.audit_period} onChange={(e) => setF({ audit_period: e.target.value })} placeholder="e.g. Q3 2026" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Plan Version</label>
                <input value={form.plan_version} onChange={(e) => setF({ plan_version: e.target.value })} placeholder="e.g. 1.0" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Prepared by *</label>
                <input value={form.prepared_by} onChange={(e) => setF({ prepared_by: e.target.value })} placeholder="Name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Date of Plan *</label>
                <input type="date" value={form.date_of_plan} onChange={(e) => setF({ date_of_plan: e.target.value })} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Scheduled Audit (required — must be on the calendar)</label>
              <select value={form.schedule_id} onChange={(e) => onScheduleChange(e.target.value)} className={selectCls}>
                <option value="">Select scheduled audit</option>
                {branchSchedules.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-800">
                    {s.date_from} → {s.date_to} {s.departments?.length ? `(${s.departments.length} dept)` : ""}
                  </option>
                ))}
              </select>
              {!form.branch_id && <p className="text-xs text-blue-200/40 mt-1">Select a branch first to see its scheduled audits.</p>}
              {form.branch_id && branchSchedules.length === 0 && (
                <p className="text-xs text-amber-300/70 mt-1">No free schedules for this branch. Go to Audit Schedule to schedule it on the calendar first (one plan per schedule, Internal or ISO 9001).</p>
              )}
            </div>

            <div>
              <label className={labelCls}>Purpose of the Audit</label>
              <textarea value={form.purpose} onChange={(e) => setF({ purpose: e.target.value })} rows={3} className={inputCls} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-blue-200/60">Included Areas (departments)</span>
                <button type="button" onClick={() => setF({ departments: selSchedule?.departments || [] })} className="text-xs text-blue-400 hover:text-blue-300">Use all from schedule</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(selSchedule?.departments || []).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDept(d)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${form.departments.includes(d) ? "bg-purple-600/30 border-purple-500/40 text-white" : "bg-white/5 border-white/10 text-blue-200/60 hover:border-white/30"}`}
                  >
                    {d}
                  </button>
                ))}
                {!selSchedule && <p className="text-xs text-blue-200/40">Departments come from the selected scheduled audit.</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Period Covered</label>
                <input value={form.period_covered} onChange={(e) => setF({ period_covered: e.target.value })} placeholder="From → To" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Locations Covered</label>
                <input value={form.locations_covered} onChange={(e) => setF({ locations_covered: e.target.value })} placeholder="e.g. Ground floor, kitchen, cold storage" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Exclusions</label>
              <input value={form.exclusions} onChange={(e) => setF({ exclusions: e.target.value })} placeholder="e.g. None" className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Audit Approach &amp; Methodology</label>
              <div className="flex flex-wrap gap-2">
                {APPROACH_ITEMS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleApproach(item)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${form.approach.includes(item) ? "bg-blue-600/30 border-blue-500/40 text-white" : "bg-white/5 border-white/10 text-blue-200/60 hover:border-white/30"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelCls}>Detailed Audit Program (Summary) — time to spend per department</label>
              <div className="space-y-2">
                {form.departments.length === 0 && <p className="text-xs text-blue-200/40">Select departments above to set their duration.</p>}
                {form.departments.map((d) => (
                  <div key={d} className="flex items-center gap-3">
                    <span className="text-sm text-white/80 w-48 truncate">{d}</span>
                    <input
                      value={form.program[d] || ""}
                      onChange={(e) => setF({ program: { ...form.program, [d]: e.target.value } })}
                      placeholder="e.g. 2 hours / 09:00–11:00"
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className={labelCls}>Audit Team &amp; Resources</label>
              <input value={form.team} onChange={(e) => setF({ team: e.target.value })} placeholder="Internal Auditor(s) names" className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>Signature (optional — default uses your saved signature)</label>
              <input type="file" accept="image/*" onChange={(e) => onSignatureUpload(e.target.files?.[0] || null)} className={inputCls} />
              <div className="mt-3 flex items-center gap-4">
                {form.signature && (
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.signature} alt="Signature" className="h-12" />
                    <button type="button" onClick={() => setF({ signature: "" })} className="text-xs text-red-400 hover:text-red-300">Reset to default</button>
                  </div>
                )}
                {!form.signature && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-blue-200/40">Default signature:</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={SIG_DEFAULT} alt="Signature" className="h-12" />
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {saving ? "Saving..." : editingPlan ? "Save Changes" : "Create Plan"}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditingPlan(null); }} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium">Cancel</button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : plans.length === 0 ? (
          <p className="text-blue-200/40 text-center py-16">No internal audit plans yet. Create a plan to start recording findings.</p>
        ) : (
          <div className="space-y-4">
            {plans.map((plan) => (
              <div key={plan.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-white">{plan.title}</h3>
                      <span className="px-2 py-0.5 text-[10px] rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200">Internal</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${statusBadge(plan.status)}`}>{plan.status}</span>
                      <span className="text-xs text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-full">{plan.branch_name}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {plan.departments.map((d) => (
                        <span key={d} className="px-2 py-0.5 text-xs rounded-full bg-white/5 border border-white/10 text-blue-200/70">{d}</span>
                      ))}
                    </div>
                    <p className="text-xs text-blue-200/40 mt-2">
                      {plan.document_number && <span>{plan.document_number} · </span>}
                      {plan.audit_period && <span>{plan.audit_period} · </span>}
                      {plan.prepared_by && <span>Prepared by {plan.prepared_by}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-blue-200/50">{plan.findings.length} finding{plan.findings.length !== 1 ? "s" : ""}</span>
                    <button onClick={() => { setViewingPlan(plan.id); setEditingPlan(null); }} className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white">Open</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {viewPlan && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Audit Plan Document</h2>
              <div className="flex gap-2">
                <button onClick={() => generatePdf(viewPlan)} disabled={downloadingPdf} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                  {downloadingPdf ? (pdfSaving ? "Saving to Google Drive..." : "Generating...") : "Save to Google Drive"}
                </button>
                {viewPlan.pdf_url && (
                  <a href={viewPlan.pdf_url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
                    View Saved PDF
                  </a>
                )}
                <button onClick={() => startEdit(viewPlan)} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium">Edit</button>
                <button onClick={() => { if (confirm("Delete plan?")) handleDelete(viewPlan.id); }} className="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium">Delete</button>
                <button onClick={() => setViewingPlan(null)} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium">Close</button>
              </div>
            </div>

            <div className="bg-white text-slate-900 rounded-2xl p-10 shadow-2xl">
              <div className="text-center border-b-2 border-blue-600 pb-4 mb-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={LOGO} alt="Brand logo" className="h-16 mx-auto mb-3" />
                <h1 className="text-2xl font-bold">INTERNAL AUDIT PLAN</h1>
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mb-6">
                <div><span className="text-slate-500">Branch Name:</span> <span className="font-medium">{viewPlan.branch_name}</span></div>
                <div><span className="text-slate-500">Audit Title:</span> <span className="font-medium">{viewPlan.title}</span></div>
                <div><span className="text-slate-500">Document Number:</span> <span className="font-medium">{viewPlan.document_number || "—"}</span></div>
                <div><span className="text-slate-500">Audit Period:</span> <span className="font-medium">{viewPlan.audit_period || "—"}</span></div>
                <div><span className="text-slate-500">Plan Version:</span> <span className="font-medium">{viewPlan.plan_version || "—"}</span></div>
                <div><span className="text-slate-500">Prepared by:</span> <span className="font-medium">{viewPlan.prepared_by || "—"}</span></div>
                <div><span className="text-slate-500">Date of Plan:</span> <span className="font-medium">{viewPlan.date_of_plan || "—"}</span></div>
              </div>

              <DocSection num="1" title="Purpose of the Audit">
                <p className="text-sm leading-relaxed">{viewPlan.purpose}</p>
              </DocSection>

              <DocSection num="2" title="Scope of the Audit">
                <p className="text-sm"><span className="font-medium">Included Areas:</span> {viewPlan.departments.length ? viewPlan.departments.join(", ") : "—"}</p>
                <p className="text-sm mt-1"><span className="font-medium">Period Covered:</span> {viewPlan.period_covered || "—"}</p>
                <p className="text-sm mt-1"><span className="font-medium">Locations Covered:</span> {viewPlan.locations_covered || "—"}</p>
                <p className="text-sm mt-1"><span className="font-medium">Exclusions:</span> {viewPlan.exclusions || "None"}</p>
              </DocSection>

              <DocSection num="3" title="Audit Approach & Methodology">
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {(viewPlan.approach.length ? viewPlan.approach : APPROACH_ITEMS).map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </DocSection>

              <DocSection num="4" title="Detailed Audit Program (Summary)">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-blue-600 text-white">
                      <th className="border border-blue-600 px-3 py-1.5 text-left font-medium">Department</th>
                      <th className="border border-blue-600 px-3 py-1.5 text-left font-medium">Duration / Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewPlan.program.length ? viewPlan.program : viewPlan.departments.map((d) => ({ department: d, duration: "" }))).map((row) => (
                      <tr key={row.department} className="odd:bg-slate-100">
                        <td className="border border-slate-300 px-3 py-1.5">{row.department}</td>
                        <td className="border border-slate-300 px-3 py-1.5">{row.duration || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DocSection>

              <DocSection num="5" title="Audit Team & Resources">
                <p className="text-sm">Internal Auditor(s): {viewPlan.audit_team || "—"}</p>
              </DocSection>

              <DocSection num="6" title="Reporting & Follow-up">
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {REPORTING_TEXT.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </DocSection>

              {viewPlan.findings.length > 0 && (
                <DocSection num="7" title="Findings">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-700 text-white">
                        <th className="border border-slate-700 px-3 py-1.5 text-left font-medium">Department</th>
                        <th className="border border-slate-700 px-3 py-1.5 text-left font-medium">Severity</th>
                        <th className="border border-slate-700 px-3 py-1.5 text-left font-medium">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewPlan.findings.map((f, i) => (
                        <tr key={i} className="odd:bg-slate-100">
                          <td className="border border-slate-300 px-3 py-1.5">{f.department}</td>
                          <td className="border border-slate-300 px-3 py-1.5">{f.type}</td>
                          <td className="border border-slate-300 px-3 py-1.5">{f.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DocSection>
              )}

              <DocSection num="10" title="Independence & Confidentiality Statement">
                <p className="text-sm leading-relaxed">{INDEPENDENCE_TEXT}</p>
              </DocSection>

              <div className="mt-10 border-t border-slate-200 pt-8 flex items-end justify-between">
                <div>
                  <p className="text-sm font-medium">Prepared by: {viewPlan.prepared_by || "_____________"}</p>
                  <div className="mt-4">
                    <p className="text-sm font-medium">Signature:</p>
                    <div className="mt-1 h-20 flex items-end">
                      {viewPlan.signature ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={viewPlan.signature} alt="Signature" className="h-16" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={SIG_DEFAULT} alt="Signature" className="h-16" />
                      )}
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Date: {viewPlan.date_of_plan || "_____________"}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function DocSection({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="font-bold text-blue-600 border-b border-slate-200 pb-1 mb-2">{num}. {title}</h3>
      {children}
    </div>
  );
}