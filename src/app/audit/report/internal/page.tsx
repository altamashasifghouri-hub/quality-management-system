"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface Department { id: string; name: string; branch_id: string; }
interface Branch { id: string; name: string; branch_manager: string | null; locations: string[] | null; departments: Department[]; }
interface AuditSchedule { id: string; branch_id: string; date_from: string; date_to: string; departments: string[]; }
interface SettingsRow { id: number; hr_name: string; ceo_name: string; }
interface Finding { department: string; type: string; detail: string; recommendation?: string; evidence?: string[]; }

interface PlanRow {
  id: string;
  title: string;
  branch_id: string;
  schedule_id: string | null;
  departments: string[];
  findings: Finding[];
  audit_period: string | null;
  period_covered: string | null;
  approach: string[];
  signature: string | null;
  prepared_by: string | null;
  document_number: string | null;
  branch_name?: string;
}

interface AuditReport {
  id: string;
  audit_id: string;
  title: string;
  document_number: string | null;
  branch_id: string | null;
  report_date: string | null;
  fieldwork_dates: string | null;
  report_period: string | null;
  locations_covered: string | null;
  prepared_by: string | null;
  background: string | null;
  objectives: string | null;
  positive_observations: string | null;
  overall_opinion: string | null;
  key_highlights: string | null;
  overall_conclusion: string | null;
  acknowledgement: string | null;
  findings: Finding[];
  summary: Record<string, number>;
  created_at: string;
  updated_at: string | null;
  pdf_url: string | null;
  pdf_public_id: string | null;
}

interface ReportForm {
  audit_id: string;
  title: string;
  document_number: string;
  branch_id: string;
  report_date: string;
  fieldwork_dates: string;
  report_period: string;
  locations_covered: string;
  prepared_by: string;
  background: string;
  objectives: string;
  positive_observations: string;
  overall_opinion: string;
  key_highlights: string;
  overall_conclusion: string;
  acknowledgement: string;
  findings: Finding[];
}

const LOGO = "/logo.jpg";
const SIG_DEFAULT = "/signature.png";

const OPINIONS = [
  { value: "Satisfactory", desc: "Controls are adequate and effective. No significant control weaknesses identified." },
  { value: "Needs Improvement", desc: "Controls are generally adequate but certain areas require management attention." },
  { value: "Unsatisfactory", desc: "Controls are inadequate in some significant areas and require immediate corrective action." },
];

const DEFAULT_OBJECTIVES = [
  "To assess the adequacy and effectiveness of internal controls in place.",
  "To evaluate compliance with company policies, brand standards and applicable laws and regulations.",
  "To verify the reliability and integrity of financial and operational information.",
  "To safeguard company assets and prevent fraud, waste and abuse.",
  "To identify opportunities for operational improvement and best practices.",
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sanitizeFile(name: string) {
  return name.replace(/[^a-zA-Z0-9]+/g, "_");
}

function genReportNumber(branchName: string, count: number) {
  const code = (branchName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase() || "QMS");
  return `QMS/IR/${new Date().getFullYear()}/${code}-${String(count + 1).padStart(3, "0")}`;
}

function formatDDMMYYYY(dateStr: string | null) {
  if (!dateStr) return "—";
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function computeSummary(findings: Finding[]) {
  const s: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  findings.forEach((f) => { if (s[f.type] !== undefined) s[f.type] += 1; });
  return s;
}

function splitLines(text: string | null) {
  return (text || "").split("\n").map((s) => s.trim()).filter(Boolean);
}

function buildBackground(branch: Branch | undefined) {
  return `The internal audit of ${branch?.name || "the branch"} was conducted for the year ${new Date().getFullYear()}. Its purpose was to evaluate the adequacy and effectiveness of internal controls, safeguard assets, ensure compliance with company policies, brand standards and applicable laws, and identify opportunities for operational improvement.`;
}

function buildAck(branch: Branch | undefined) {
  return `Management and staff at ${branch?.name || "the branch"} are sincerely thanked for their cooperation and support during the internal audit.`;
}

const emptyForm = (): ReportForm => ({
  audit_id: "", title: "", document_number: "", branch_id: "", report_date: todayStr(),
  fieldwork_dates: "", report_period: "", locations_covered: "", prepared_by: "",
  background: "", objectives: DEFAULT_OBJECTIVES.join("\n"), positive_observations: "",
  overall_opinion: "", key_highlights: "", overall_conclusion: "", acknowledgement: "", findings: [],
});

export default function InternalAuditReport() {
  const supabase = createClient();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [schedules, setSchedules] = useState<AuditSchedule[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [reports, setReports] = useState<AuditReport[]>([]);
  const [settingsRow, setSettingsRow] = useState<SettingsRow | null>(null);
  const [userFullName, setUserFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [pdfSaving, setPdfSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ReportForm>(emptyForm());
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [viewingReportId, setViewingReportId] = useState<string | null>(null);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 3000); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 4000); }
  function setF(patch: Partial<ReportForm>) { setForm((prev) => ({ ...prev, ...patch })); }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: branchData }, { data: schedData }, { data: planData }, { data: reportData }, { data: settingsData }] = await Promise.all([
      supabase.from("branches").select("*").order("created_at", { ascending: true }),
      supabase.from("audit_schedules").select("*").order("date_from", { ascending: true }),
      supabase.from("internal_audits").select("*").order("created_at", { ascending: false }),
      supabase.from("audit_reports").select("*").order("created_at", { ascending: false }),
      supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    const branchName = new Map<string, string>();
    const branchesArr: Branch[] = (branchData || []).map((b: any) => {
      branchName.set(b.id, b.name);
      return { id: b.id, name: b.name, branch_manager: b.branch_manager || null, locations: b.locations || null, departments: [] };
    });
    setBranches(branchesArr);
    setSchedules((schedData || []).map((s: any) => ({
      id: s.id, branch_id: s.branch_id, date_from: s.date_from, date_to: s.date_to, departments: s.departments || [],
    })));
    setPlans((planData || []).map((p: any) => ({
      id: p.id, title: p.title, branch_id: p.branch_id, schedule_id: p.schedule_id,
      departments: p.departments || [], findings: p.findings || [], audit_period: p.audit_period,
      period_covered: p.period_covered, approach: p.approach || [], signature: p.signature,
      prepared_by: p.prepared_by, document_number: p.document_number,
      branch_name: branchName.get(p.branch_id) || "",
    })));
    setReports((reportData || []).map((r: any) => ({
      id: r.id, audit_id: r.audit_id, title: r.title, document_number: r.document_number,
      branch_id: r.branch_id, report_date: r.report_date, fieldwork_dates: r.fieldwork_dates,
      report_period: r.report_period, locations_covered: r.locations_covered, prepared_by: r.prepared_by,
      background: r.background, objectives: r.objectives, positive_observations: r.positive_observations,
      overall_opinion: r.overall_opinion, key_highlights: r.key_highlights, overall_conclusion: r.overall_conclusion,
      acknowledgement: r.acknowledgement, findings: r.findings || [], summary: r.summary || {},
      created_at: r.created_at, updated_at: r.updated_at, pdf_url: r.pdf_url, pdf_public_id: r.pdf_public_id,
    })));
    if (settingsData) setSettingsRow({ id: settingsData.id, hr_name: settingsData.hr_name || "", ceo_name: settingsData.ceo_name || "" });
    supabase.auth.getUser().then(({ data }) => {
      setUserFullName((data.user?.user_metadata?.full_name as string) ?? "");
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const branchById = new Map(branches.map((b) => [b.id, b]));
  const planById = new Map(plans.map((p) => [p.id, p]));

  function onPlanChange(id: string) {
    const plan = planById.get(id);
    if (!plan) return;
    const branch = branchById.get(plan.branch_id);
    const existing = reports.find((r) => r.audit_id === plan.id);
    const schedule = schedules.find((s) => s.id === plan.schedule_id);
    if (existing) {
      setEditingReportId(existing.id);
      setF({
        audit_id: plan.id, title: existing.title, document_number: existing.document_number || "",
        branch_id: plan.branch_id, report_date: existing.report_date || todayStr(),
        fieldwork_dates: existing.fieldwork_dates || "",
        report_period: existing.report_period || plan.period_covered || plan.audit_period || "",
        locations_covered: existing.locations_covered || (branch?.locations || []).join(", ") || "",
        prepared_by: existing.prepared_by || userFullName,
        background: existing.background || buildBackground(branch),
        objectives: existing.objectives || DEFAULT_OBJECTIVES.join("\n"),
        positive_observations: existing.positive_observations || "",
        overall_opinion: existing.overall_opinion || "",
        key_highlights: existing.key_highlights || "",
        overall_conclusion: existing.overall_conclusion || "",
        acknowledgement: existing.acknowledgement || buildAck(branch),
        findings: existing.findings.length ? existing.findings : plan.findings || [],
      });
      return;
    }
    setEditingReportId(null);
    setF({
      audit_id: plan.id,
      title: `Internal Audit Report – ${branch?.name || "Branch"} & ${plan.title}`,
      document_number: genReportNumber(branch?.name || plan.branch_name || "QMS", reports.length),
      branch_id: plan.branch_id, report_date: todayStr(),
      fieldwork_dates: schedule ? `${schedule.date_from} to ${schedule.date_to}` : (plan.audit_period || ""),
      report_period: plan.period_covered || plan.audit_period || "",
      locations_covered: (branch?.locations || []).join(", ") || "",
      prepared_by: userFullName,
      background: buildBackground(branch),
      objectives: DEFAULT_OBJECTIVES.join("\n"),
      positive_observations: "",
      overall_opinion: "",
      key_highlights: "",
      overall_conclusion: "",
      acknowledgement: buildAck(branch),
      findings: plan.findings || [],
    });
  }

  async function handleSaveReport(e: React.FormEvent) {
    e.preventDefault();
    if (!form.audit_id) return showErr("Select an audit plan.");
    if (!form.title.trim()) return showErr("Enter a report title.");
    if (!form.report_date) return showErr("Enter the report date.");
    if (!form.prepared_by.trim()) return showErr("Enter Prepared by.");
    if (!form.overall_opinion) return showErr("Select an overall audit opinion.");

    const payload = {
      audit_id: form.audit_id,
      title: form.title.trim(),
      document_number: form.document_number.trim(),
      branch_id: form.branch_id,
      report_date: form.report_date || null,
      fieldwork_dates: form.fieldwork_dates.trim(),
      report_period: form.report_period.trim(),
      locations_covered: form.locations_covered.trim(),
      prepared_by: form.prepared_by.trim(),
      background: form.background.trim(),
      objectives: form.objectives.trim(),
      positive_observations: form.positive_observations.trim(),
      overall_opinion: form.overall_opinion,
      key_highlights: form.key_highlights.trim(),
      overall_conclusion: form.overall_conclusion.trim(),
      acknowledgement: form.acknowledgement.trim(),
      findings: form.findings,
      summary: computeSummary(form.findings),
      updated_at: new Date().toISOString(),
    };

    setSaving(true);
    let savedId = editingReportId;
    if (editingReportId) {
      const { error: err } = await supabase.from("audit_reports").update(payload).eq("id", editingReportId);
      if (err) { setSaving(false); return showErr(err.message); }
    } else {
      const { data, error: err } = await supabase.from("audit_reports").insert(payload).select("id").single();
      if (err) { setSaving(false); return showErr(err.message); }
      savedId = data?.id || null;
    }
    setSaving(false);
    setShowForm(false); setEditingReportId(null);

    if (savedId) {
      const reportToView = formAsReport(savedId);
      setForm(emptyForm());
      showMsg(editingReportId ? "Report updated." : "Report created.");
      await fetchData();
      setViewingReportId(savedId);
      generatePdf(reportToView).catch(() => {});
    } else {
      setForm(emptyForm());
    }
  }

  function formAsReport(id: string): AuditReport {
    return {
      id,
      audit_id: form.audit_id,
      title: form.title.trim(),
      document_number: form.document_number.trim() || null,
      branch_id: form.branch_id,
      report_date: form.report_date,
      fieldwork_dates: form.fieldwork_dates.trim() || null,
      report_period: form.report_period.trim() || null,
      locations_covered: form.locations_covered.trim() || null,
      prepared_by: form.prepared_by.trim() || null,
      background: form.background.trim() || null,
      objectives: form.objectives.trim() || null,
      positive_observations: form.positive_observations.trim() || null,
      overall_opinion: form.overall_opinion,
      key_highlights: form.key_highlights.trim() || null,
      overall_conclusion: form.overall_conclusion.trim() || null,
      acknowledgement: form.acknowledgement.trim() || null,
      findings: form.findings,
      summary: computeSummary(form.findings),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pdf_url: null,
      pdf_public_id: null,
    };
  }

  async function handleDeleteReport(id: string) {
    const { error: err } = await supabase.from("audit_reports").delete().eq("id", id);
    if (err) return showErr(err.message);
    showMsg("Report deleted.");
    setViewingReportId(null); setEditingReportId(null);
    fetchData();
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

  async function generatePdf(report: AuditReport) {
    setDownloadingPdf(true);
    setError("");
    try {
      const plan = planById.get(report.audit_id);
      const branch = branchById.get(report.branch_id || plan?.branch_id || "");
      const manager = branch?.branch_manager || "—";
      const sigUrl = plan?.signature || SIG_DEFAULT;

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
      doc.text("INTERNAL AUDIT REPORT", pageWidth / 2, y, { align: "center" });
      y += 8;
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Report Reference No: ${report.document_number || "—"}`, pageWidth - margin, y, { align: "right" });
      y += 14;

      const line = (t: string, size = 10, color: [number, number, number] = [30, 41, 59], gap = 5) => {
        doc.setFontSize(size);
        doc.setTextColor(color[0], color[1], color[2]);
        const lines = doc.splitTextToSize(t, maxWidth);
        doc.text(lines, margin, y);
        y += (lines.length * size * 0.45) + gap;
        return y;
      };
      const sectionTitle = (t: string) => {
        if (y > 700) { doc.addPage(); y = margin; }
        doc.setFontSize(12);
        doc.setTextColor(29, 78, 216);
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
      const opinionLine = (checked: boolean, value: string, desc?: string) => {
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        const mark = checked ? "[X]" : "[ ]";
        const text = `${mark} ${value}${desc ? ` — ${desc}` : ""}`;
        const wrapped = doc.splitTextToSize(text, maxWidth);
        if (y + wrapped.length * 4.5 + 3 > 790) { doc.addPage(); y = margin; }
        doc.text(wrapped, margin, y);
        y += wrapped.length * 4.5 + 3;
      };

      autoTable(doc, {
        startY: y,
        theme: "grid",
        head: [["Field", "Value"]],
        body: [
          ["Hotel / Branch Name", branch?.name || plan?.branch_name || "—"],
          ["Report Title", report.title || "—"],
          ["Fieldwork Dates", report.fieldwork_dates || "—"],
          ["Report Reference No.", report.document_number || "—"],
          ["Report Date", formatDDMMYYYY(report.report_date)],
          ["Prepared by", report.prepared_by || "—"],
          ["Distributed to", manager],
        ],
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [29, 78, 216] },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(9); doc.setTextColor(51, 65, 85);
      doc.text("Signature:", margin, y);
      try {
        const dataUrl = await loadImageData(sigUrl);
        doc.addImage(dataUrl, "PNG", margin + 22, y - 4, 40, 18);
      } catch { /* signature unavailable */ }
      y += 12;

      sectionTitle("1. Executive Summary");
      doc.setFontSize(10);
      const summary = report.summary && Object.keys(report.summary).length ? report.summary : computeSummary(report.findings);
      doc.setTextColor(30, 41, 59);
      const totalFindings = (["Critical", "High", "Medium", "Low"] as const).reduce((n, s) => n + (summary[s] || 0), 0);
      doc.text(
        `Total Findings: ${totalFindings}  |  Critical: ${summary.Critical || 0}  |  High: ${summary.High || 0}  |  Medium: ${summary.Medium || 0}  |  Low: ${summary.Low || 0}`,
        margin, y
      );
      y += 8;
      doc.setFontSize(10); doc.setTextColor(51, 65, 85);
      doc.text("Overall Audit Opinion:", margin, y); y += 6;
      OPINIONS.forEach((op) => opinionLine(report.overall_opinion === op.value, op.value));
      if (report.overall_opinion) {
        const chosen = OPINIONS.find((op) => op.value === report.overall_opinion);
        if (chosen) { doc.setFontSize(9); doc.setTextColor(51, 65, 85); opinionLine(true, "Issued Opinion", chosen.desc); }
      }
      y += 4;
      doc.setFontSize(10); doc.setTextColor(51, 65, 85);
      doc.text("Key Highlights:", margin, y); y += 6;
      const highlights = splitLines(report.key_highlights);
      (highlights.length ? highlights : ["—"]).forEach(bullet);
      y += 4;
      doc.setFontSize(10); doc.setTextColor(51, 65, 85);
      doc.text("Overall Conclusion:", margin, y); y += 6;
      line(report.overall_conclusion || "—", 10, [30, 41, 59]);

      sectionTitle("2. Introduction");
      doc.setFontSize(10); doc.setTextColor(51, 65, 85);
      doc.text("Background:", margin, y); y += 6;
      line(report.background || `The internal audit of ${branch?.name || "the branch"} was conducted for the year ${new Date().getFullYear()}.`, 10, [30, 41, 59]);
      y += 4;
      doc.setFontSize(10); doc.setTextColor(51, 65, 85);
      doc.text("Objectives:", margin, y); y += 6;
      (splitLines(report.objectives).length ? splitLines(report.objectives) : DEFAULT_OBJECTIVES).forEach(bullet);
      y += 4;
      doc.setFontSize(10); doc.setTextColor(51, 65, 85);
      doc.text("Scope & Methodology:", margin, y); y += 6;
      line(`Period Covered: ${report.report_period || formatDDMMYYYY(report.report_date)}`, 10, [30, 41, 59]);
      doc.text("Locations Covered:", margin, y); y += 6;
      const locations = (report.locations_covered || "").split(",").map((s) => s.trim()).filter(Boolean);
      (locations.length ? locations : ["—"]).forEach(bullet);
      y += 4;
      doc.text("Methodology:", margin, y); y += 6;
      (plan?.approach.length ? plan.approach : []).forEach(bullet);

      sectionTitle("3. Audit Findings & Recommendations");
      if (report.findings.length === 0) {
        line("No findings recorded for this audit.", 10, [51, 65, 85]);
      } else {
        if (y > 730) { doc.addPage(); y = margin; }
        autoTable(doc, {
          startY: y,
          theme: "grid",
          head: [["Ref", "Department", "Risk Rating", "Finding / Recommendation"]],
          body: report.findings.map((f, i) => [String(i + 1).padStart(2, "0"), f.department, f.type, f.detail]),
          styles: { fontSize: 9, cellPadding: 2.5 },
          headStyles: { fillColor: [29, 78, 216] },
          columnStyles: { 0: { cellWidth: 14 }, 3: { cellWidth: 90 } },
        });
        y = (doc as any).lastAutoTable.finalY + 12;
      }

      sectionTitle("4. Positive Observations / Good Practices");
      const positives = splitLines(report.positive_observations);
      (positives.length ? positives : ["None recorded."]).forEach(bullet);

      sectionTitle("5. Summary of Findings by Risk Rating");
      const rows: [string, string, string][] = [];
      (["Critical", "High", "Medium", "Low"] as const).forEach((sev) => {
        const refs: number[] = [];
        report.findings.forEach((f, idx) => { if (f.type === sev) refs.push(idx + 1); });
        rows.push([sev, String(refs.length), refs.map((n) => String(n).padStart(2, "0")).join(", ")]);
      });
      const total = (["Critical", "High", "Medium", "Low"] as const).reduce((n, s) => n + (summary[s] || 0), 0);
      rows.push(["Total", String(total), ""]);
      if (y > 730) { doc.addPage(); y = margin; }
      autoTable(doc, {
        startY: y,
        theme: "grid",
        head: [["Risk Rating", "Number of Findings", "References"]],
        body: rows,
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [29, 78, 216] },
        columnStyles: { 0: { fontStyle: "bold" } },
      });
      y = (doc as any).lastAutoTable.finalY + 12;

      sectionTitle("6. Overall Conclusion & Opinion");
      OPINIONS.forEach((op) => opinionLine(report.overall_opinion === op.value, op.value, op.desc));

      sectionTitle("7. Acknowledgement");
      line(report.acknowledgement || buildAck(branch), 10, [30, 41, 59]);

      sectionTitle("8. Distribution List");
      if (y > 730) { doc.addPage(); y = margin; }
      autoTable(doc, {
        startY: y,
        theme: "grid",
        head: [["Role", "Name"]],
        body: [
          ["Branch Manager", manager],
          ["HR", settingsRow?.hr_name || "—"],
          ["CEO", settingsRow?.ceo_name || "—"],
        ],
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [29, 78, 216] },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
      });
      y = (doc as any).lastAutoTable.finalY + 16;

      if (y > 740) { doc.addPage(); y = margin; }
      doc.setFontSize(10); doc.setTextColor(51, 65, 85);
      doc.text(`Prepared by: ${report.prepared_by || "_______________"}`, margin, y);
      doc.text(`Date: ${formatDDMMYYYY(report.report_date)}`, pageWidth - margin, y, { align: "right" });
      y += 14;
      doc.text("Signature:", margin, y);
      try {
        const dataUrl = await loadImageData(sigUrl);
        doc.addImage(dataUrl, "PNG", margin + 20, y - 8, 45, 22);
      } catch { /* signature image unavailable */ }

      setPdfSaving(true);
      try {
        const blob = doc.output("blob");
        const formData = new FormData();
        formData.append("file", blob, `${sanitizeFile(branch?.name || plan?.branch_name || "Internal")}_Internal_Audit_Report.pdf`);
        formData.append("folderKind", "report");
        const res = await fetch("/api/drive-upload", { method: "POST", body: formData });
        if (res.ok) {
          const json = await res.json();
          if (json.url) {
            const { error: updErr } = await supabase
              .from("audit_reports")
              .update({ pdf_url: json.url, pdf_public_id: json.fileId || null, updated_at: new Date().toISOString() })
              .eq("id", report.id);
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

  const viewingReport = viewingReportId ? reports.find((r) => r.id === viewingReportId) : null;
  const viewingPlan = viewingReport ? planById.get(viewingReport.audit_id) : null;
  const viewingBranch = viewingReport ? branchById.get(viewingReport.branch_id || viewingPlan?.branch_id || "") : null;

  const inputCls = "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark] w-full";
  const selectCls = "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark] w-full";
  const labelCls = "block text-sm text-blue-200/60 mb-1";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/audit/report" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to Audit Report
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Internal Audit Report</h1>
            <p className="text-blue-200/60">Generate internal audit reports from audit plans</p>
          </div>
          <button
            onClick={() => { setShowForm((v) => !v); setEditingReportId(null); setForm(emptyForm()); }}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
          >
            {showForm ? "Cancel" : "+ New Report"}
          </button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

        {showForm && (
          <form onSubmit={handleSaveReport} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-8 space-y-5">
            <h2 className="text-xl font-bold text-white">{editingReportId ? "Edit Internal Audit Report" : "New Internal Audit Report"}</h2>

            <div>
              <label className={labelCls}>Internal Audit Plan *</label>
              <select value={form.audit_id} onChange={(e) => onPlanChange(e.target.value)} className={selectCls}>
                <option value="">Select an audit plan</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-800">
                    {p.branch_name} — {p.title} ({p.findings.length} finding{p.findings.length !== 1 ? "s" : ""})
                  </option>
                ))}
              </select>
              {plans.length === 0 && <p className="text-xs text-amber-300/70 mt-1">No audit plans yet. Create an Internal Audit Plan first.</p>}
              {form.audit_id && editingReportId && <p className="text-xs text-amber-300/70 mt-1">A report already exists for this plan — editing it.</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Report Title *</label>
                <input value={form.title} onChange={(e) => setF({ title: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Report Reference No. *</label>
                <input value={form.document_number} onChange={(e) => setF({ document_number: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Report Date *</label>
                <input type="date" value={form.report_date} onChange={(e) => setF({ report_date: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Fieldwork Dates</label>
                <input value={form.fieldwork_dates} onChange={(e) => setF({ fieldwork_dates: e.target.value })} placeholder="Days the audit was conducted" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Period Covered</label>
                <input value={form.report_period} onChange={(e) => setF({ report_period: e.target.value })} placeholder="From → To" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Locations Covered (tags from your branch settings)</label>
                <input value={form.locations_covered} onChange={(e) => setF({ locations_covered: e.target.value })} placeholder="Comma separated locations" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Prepared by *</label>
                <input value={form.prepared_by} onChange={(e) => setF({ prepared_by: e.target.value })} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Background</label>
              <textarea value={form.background} onChange={(e) => setF({ background: e.target.value })} rows={2} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Objectives (one per line)</label>
              <textarea value={form.objectives} onChange={(e) => setF({ objectives: e.target.value })} rows={6} className={inputCls} />
            </div>

            <div>
              <span className="block text-sm text-blue-200/60 mb-2">Overall Audit Opinion *</span>
              <div className="flex flex-col sm:flex-row gap-3">
                {OPINIONS.map((op) => (
                  <button
                    key={op.value}
                    type="button"
                    onClick={() => setF({ overall_opinion: op.value })}
                    className={`flex-1 px-4 py-3 text-sm rounded-xl border transition-colors text-left ${form.overall_opinion === op.value ? "bg-purple-600/30 border-purple-500/40 text-white" : "bg-white/5 border-white/10 text-blue-200/60 hover:border-white/30"}`}
                  >
                    <span className="block font-medium">{op.value}</span>
                    <span className="block text-xs text-blue-200/50 mt-1">{op.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelCls}>Key Highlights (one per line)</label>
              <textarea value={form.key_highlights} onChange={(e) => setF({ key_highlights: e.target.value })} rows={3} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Overall Conclusion</label>
              <textarea value={form.overall_conclusion} onChange={(e) => setF({ overall_conclusion: e.target.value })} rows={2} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Positive Observations / Good Practices (one per line)</label>
              <textarea value={form.positive_observations} onChange={(e) => setF({ positive_observations: e.target.value })} rows={3} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Acknowledgement</label>
              <textarea value={form.acknowledgement} onChange={(e) => setF({ acknowledgement: e.target.value })} rows={2} className={inputCls} />
            </div>

            <div>
              <span className="block text-sm text-blue-200/60 mb-2">Findings for this audit — evidence pictures are added in the Findings and Evidences section</span>
              {form.findings.length === 0 ? (
                <p className="text-xs text-blue-200/40">No findings on this plan yet. Generate them from Audit Records → Internal.</p>
              ) : (
                <>
                  {(() => {
                    const s = computeSummary(form.findings);
                    return (
                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className="px-3 py-1 text-xs rounded-full bg-red-500/20 border border-red-500/30 text-red-200">Critical: {s.Critical}</span>
                        <span className="px-3 py-1 text-xs rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-200">High: {s.High}</span>
                        <span className="px-3 py-1 text-xs rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-200">Medium: {s.Medium}</span>
                        <span className="px-3 py-1 text-xs rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-200">Low: {s.Low}</span>
                      </div>
                    );
                  })()}
                  <div className="max-h-72 overflow-auto rounded-lg border border-white/10">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-white/10 text-left text-xs text-blue-200/60 sticky top-0">
                          <th className="px-3 py-2 font-medium">Department</th>
                          <th className="px-3 py-2 font-medium">Severity</th>
                          <th className="px-3 py-2 font-medium">Detail</th>
                          <th className="px-3 py-2 font-medium">Evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.findings.map((f, i) => (
                          <tr key={i} className="border-t border-white/5 align-top">
                            <td className="px-3 py-2 text-white/80 whitespace-nowrap">{f.department}</td>
                            <td className="px-3 py-2 text-white/80 whitespace-nowrap">{f.type}</td>
                            <td className="px-3 py-2 text-white/60">{f.detail}</td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1.5 max-w-[220px]">
                                {(f.evidence && f.evidence.length > 0) ? f.evidence.map((url, j) => (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <a key={j} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="Evidence" className="w-14 h-12 object-cover rounded border border-white/20 hover:opacity-80" /></a>
                                )) : <span className="text-blue-200/30 text-xs">—</span>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {saving ? "Saving..." : editingReportId ? "Save Changes" : "Create Report"}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditingReportId(null); }} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium">Cancel</button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : reports.length === 0 ? (
          <p className="text-blue-200/40 text-center py-16">No audit reports yet. Create a report from an audit plan.</p>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => {
              const branch = branchById.get(report.branch_id || "");
              const plan = planById.get(report.audit_id);
              const s = report.summary && Object.keys(report.summary).length ? report.summary : computeSummary(report.findings);
              return (
                <div key={report.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-semibold text-white">{report.title}</h3>
                        {report.overall_opinion && (
                          <span className={`px-2 py-0.5 text-xs rounded-full ${report.overall_opinion === "Satisfactory" ? "bg-green-500/20 text-green-300" : report.overall_opinion === "Needs Improvement" ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-red-300"}`}>{report.overall_opinion}</span>
                        )}
                        <span className="text-xs text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-full">{branch?.name || plan?.branch_name || "—"}</span>
                      </div>
                      <p className="text-xs text-blue-200/40 mt-2">
                        {report.document_number && <span>{report.document_number} · </span>}
                        {report.report_date && <span>Report Date {formatDDMMYYYY(report.report_date)} · </span>}
                        {report.prepared_by && <span>Prepared by {report.prepared_by}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-blue-200/50">{report.findings.length} finding{report.findings.length !== 1 ? "s" : ""} (Critical {s.Critical || 0} · High {s.High || 0})</span>
                      <button onClick={() => { setViewingReportId(report.id); setEditingReportId(null); }} className="px-3 py-1.5 text-xs rounded-lg bg-purple-600 hover:bg-purple-500 text-white">Open</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {viewingReport && (
          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-bold text-white">Internal Audit Report</h2>
              <div className="flex flex-wrap gap-2">
                {!viewingReport.pdf_url && (
                  <button onClick={() => generatePdf(viewingReport)} disabled={downloadingPdf} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                    {downloadingPdf ? (pdfSaving ? "Saving to Google Drive..." : "Generating...") : "Generate & Save PDF"}
                  </button>
                )}
                {viewingReport.pdf_url && (
                  <a href={viewingReport.pdf_url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors">
                    View Saved PDF
                  </a>
                )}
                <button onClick={() => { setViewingReportId(null); onPlanChange(viewingReport.audit_id); setShowForm(true); }} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium">Edit</button>
                <button onClick={() => { if (confirm("Delete report?")) handleDeleteReport(viewingReport.id); }} className="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium">Delete</button>
                <button onClick={() => setViewingReportId(null)} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium">Close</button>
              </div>
            </div>

            <div className="bg-white text-slate-900 rounded-2xl p-5 sm:p-10 shadow-2xl overflow-x-auto">
              <div className="text-center border-b-2 border-purple-600 pb-4 mb-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={LOGO} alt="Brand logo" className="h-16 mx-auto mb-3" />
                <h1 className="text-2xl font-bold">INTERNAL AUDIT REPORT</h1>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm mb-6">
                <div><span className="text-slate-500">Hotel / Branch Name:</span> <span className="font-medium">{viewingBranch?.name || viewingPlan?.branch_name}</span></div>
                <div><span className="text-slate-500">Report Title:</span> <span className="font-medium">{viewingReport.title}</span></div>
                <div><span className="text-slate-500">Fieldwork Dates:</span> <span className="font-medium">{viewingReport.fieldwork_dates || "—"}</span></div>
                <div><span className="text-slate-500">Report Reference No.:</span> <span className="font-medium">{viewingReport.document_number || "—"}</span></div>
                <div><span className="text-slate-500">Report Date:</span> <span className="font-medium">{formatDDMMYYYY(viewingReport.report_date)}</span></div>
                <div><span className="text-slate-500">Prepared by:</span> <span className="font-medium">{viewingReport.prepared_by || "—"}</span></div>
                <div><span className="text-slate-500">Distributed to:</span> <span className="font-medium">{viewingBranch?.branch_manager || "—"}</span></div>
              </div>

              <DocSection num="1" title="Executive Summary">
                <p className="text-sm"><span className="font-medium">Total Findings:</span> {viewingReport.findings.length} (Critical {viewingReport.summary.Critical || 0} · High {viewingReport.summary.High || 0} · Medium {viewingReport.summary.Medium || 0} · Low {viewingReport.summary.Low || 0})</p>
                <p className="text-sm mt-2"><span className="font-medium">Overall Audit Opinion:</span> {viewingReport.overall_opinion || "—"}</p>
                {viewingReport.key_highlights && (
                  <ul className="list-disc pl-5 text-sm space-y-1 mt-2">
                    {splitLines(viewingReport.key_highlights).map((h) => <li key={h}>{h}</li>)}
                  </ul>
                )}
                {viewingReport.overall_conclusion && <p className="text-sm mt-2"><span className="font-medium">Overall Conclusion:</span> {viewingReport.overall_conclusion}</p>}
              </DocSection>

              <DocSection num="2" title="Introduction">
                <p className="text-sm leading-relaxed"><span className="font-medium">Background:</span> {viewingReport.background}</p>
                <p className="text-sm mt-2"><span className="font-medium">Objectives:</span></p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {(splitLines(viewingReport.objectives).length ? splitLines(viewingReport.objectives) : DEFAULT_OBJECTIVES).map((o) => <li key={o}>{o}</li>)}
                </ul>
                <p className="text-sm mt-2"><span className="font-medium">Period Covered:</span> {viewingReport.report_period || formatDDMMYYYY(viewingReport.report_date)}</p>
                <p className="text-sm mt-1"><span className="font-medium">Locations Covered:</span></p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(viewingReport.locations_covered || "").split(",").map((s) => s.trim()).filter(Boolean).map((loc) => (
                    <span key={loc} className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-800">{loc}</span>
                  ))}
                  {!(viewingReport.locations_covered || "").split(",").some((s) => s.trim()) && <span className="text-sm text-slate-500">—</span>}
                </div>
                <p className="text-sm mt-2"><span className="font-medium">Methodology:</span></p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  {(viewingPlan?.approach.length ? viewingPlan.approach : []).map((a) => <li key={a}>{a}</li>)}
                </ul>
              </DocSection>

              <DocSection num="3" title="Audit Findings & Recommendations">
                {viewingReport.findings.length === 0 ? (
                  <p className="text-sm">No findings recorded for this audit.</p>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-700 text-white">
                        <th className="border border-slate-700 px-3 py-1.5 text-left font-medium">Ref</th>
                        <th className="border border-slate-700 px-3 py-1.5 text-left font-medium">Department</th>
                        <th className="border border-slate-700 px-3 py-1.5 text-left font-medium">Risk Rating</th>
                        <th className="border border-slate-700 px-3 py-1.5 text-left font-medium">Finding / Recommendation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewingReport.findings.map((f, i) => (
                        <tr key={i} className="odd:bg-slate-100">
                          <td className="border border-slate-300 px-3 py-1.5">{String(i + 1).padStart(2, "0")}</td>
                          <td className="border border-slate-300 px-3 py-1.5">{f.department}</td>
                          <td className="border border-slate-300 px-3 py-1.5">{f.type}</td>
                          <td className="border border-slate-300 px-3 py-1.5">{f.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </DocSection>

              <DocSection num="4" title="Positive Observations / Good Practices">
                {splitLines(viewingReport.positive_observations).length ? (
                  <ul className="list-disc pl-5 text-sm space-y-1">
                    {splitLines(viewingReport.positive_observations).map((p) => <li key={p}>{p}</li>)}
                  </ul>
                ) : (
                  <p className="text-sm">None recorded.</p>
                )}
              </DocSection>

              <DocSection num="5" title="Summary of Findings by Risk Rating">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-purple-600 text-white">
                      <th className="border border-purple-600 px-3 py-1.5 text-left font-medium">Risk Rating</th>
                      <th className="border border-purple-600 px-3 py-1.5 text-left font-medium">Number of Findings</th>
                      <th className="border border-purple-600 px-3 py-1.5 text-left font-medium">References</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["Critical", "High", "Medium", "Low"] as const).map((sev) => {
                      const refs: number[] = [];
                      viewingReport.findings.forEach((f, idx) => { if (f.type === sev) refs.push(idx + 1); });
                      return (
                        <tr key={sev} className="odd:bg-slate-100">
                          <td className="border border-slate-300 px-3 py-1.5 font-medium">{sev}</td>
                          <td className="border border-slate-300 px-3 py-1.5">{refs.length}</td>
                          <td className="border border-slate-300 px-3 py-1.5">{refs.map((n) => String(n).padStart(2, "0")).join(", ")}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-100">
                      <td className="border border-slate-300 px-3 py-1.5 font-medium">Total</td>
                      <td className="border border-slate-300 px-3 py-1.5">{viewingReport.findings.length}</td>
                      <td className="border border-slate-300 px-3 py-1.5"></td>
                    </tr>
                  </tbody>
                </table>
              </DocSection>

              <DocSection num="6" title="Overall Conclusion & Opinion">
                {OPINIONS.map((op) => (
                  <p key={op.value} className="text-sm">
                    <span className="font-medium">{viewingReport.overall_opinion === op.value ? "[X]" : "[ ]"} {op.value}</span>
                    {" — "}{op.desc}
                  </p>
                ))}
              </DocSection>

              <DocSection num="7" title="Acknowledgement">
                <p className="text-sm leading-relaxed">{viewingReport.acknowledgement}</p>
              </DocSection>

              <DocSection num="8" title="Distribution List">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-purple-600 text-white">
                      <th className="border border-purple-600 px-3 py-1.5 text-left font-medium">Role</th>
                      <th className="border border-purple-600 px-3 py-1.5 text-left font-medium">Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="odd:bg-slate-100">
                      <td className="border border-slate-300 px-3 py-1.5 font-medium">Branch Manager</td>
                      <td className="border border-slate-300 px-3 py-1.5">{viewingBranch?.branch_manager || "—"}</td>
                    </tr>
                    <tr className="odd:bg-slate-100">
                      <td className="border border-slate-300 px-3 py-1.5 font-medium">HR</td>
                      <td className="border border-slate-300 px-3 py-1.5">{settingsRow?.hr_name || "—"}</td>
                    </tr>
                    <tr className="odd:bg-slate-100">
                      <td className="border border-slate-300 px-3 py-1.5 font-medium">CEO</td>
                      <td className="border border-slate-300 px-3 py-1.5">{settingsRow?.ceo_name || "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </DocSection>

              <div className="mt-10 border-t border-slate-200 pt-8 flex items-end justify-between">
                <div>
                  <p className="text-sm font-medium">Prepared by: {viewingReport.prepared_by || "_____________"}</p>
                  <div className="mt-4">
                    <p className="text-sm font-medium">Signature:</p>
                    <div className="mt-1 h-20 flex items-end">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={viewingPlan?.signature || SIG_DEFAULT} alt="Signature" className="h-16" />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Date: {formatDDMMYYYY(viewingReport.report_date)}</p>
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
      <h3 className="font-bold text-purple-600 border-b border-slate-200 pb-1 mb-2">{num}. {title}</h3>
      {children}
    </div>
  );
}