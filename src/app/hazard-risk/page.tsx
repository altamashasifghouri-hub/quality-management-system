"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import { deleteDriveFileByUrl } from "@/lib/drive-file";
import { driveErrorMessage } from "@/lib/drive-error";
import { loadPdfImage, preloadPdfImages } from "@/lib/pdf-image";
import { evidenceDisplayUrl, LARGE_UPLOAD_THRESHOLD, uploadLargeFile } from "@/lib/evidence";
import EvidenceThumb from "@/components/EvidenceThumb";

interface Branch {
  id: string;
  name: string;
  branch_manager: string | null;
}

interface Finding {
  key: string;
  location: string;
  description: string;
  hazard: string;
  risk_level: string;
  applicable_requirement: string;
  osha_standard: string;
  evidence: string;
  images: string[];
  current_status: string;
  immediate_action: string;
  corrective_action: string;
  responsible_person: string;
  target_date: string;
  follow_up: string;
}

interface HazardReport {
  id: string;
  branch_id: string;
  title: string;
  report_date: string;
  responsible_person: string | null;
  auditor_name: string | null;
  auditor_signature: string | null;
  status: string;
  findings: Finding[];
  publish_history: string[];
  pdf_url: string | null;
  pdf_public_id: string | null;
  created_at: string;
  updated_at: string;
  branch_name?: string;
}

const LOGO = "/logo.jpg";
const SIG_DEFAULT = "/signature.png";
const RISK_LEVELS = ["Low", "Medium", "High", "Critical"];
const NON_CONFORMANCE_OPTIONS = ["Major Non-Conformance", "Minor Non-Conformance"];
const BRANCH_COLORS = ["bg-emerald-500", "bg-teal-500", "bg-amber-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500", "bg-orange-500"];

const FIELDS: { key: keyof Finding; label: string; long?: boolean }[] = [
  { key: "location", label: "Location" },
  { key: "description", label: "Description", long: true },
  { key: "hazard", label: "Hazard", long: true },
  { key: "risk_level", label: "Risk Level" },
  { key: "applicable_requirement", label: "Applicable Requirement", long: true },
  { key: "osha_standard", label: "OSHA Standard No." },
  { key: "evidence", label: "Evidence", long: true },
  { key: "current_status", label: "Current Status" },
  { key: "immediate_action", label: "Immediate Action Required", long: true },
  { key: "corrective_action", label: "Corrective Action", long: true },
  { key: "responsible_person", label: "Responsible Person" },
  { key: "target_date", label: "Target Date" },
  { key: "follow_up", label: "Follow-up", long: true },
];

function sanitizeFile(name: string) {
  return name.replace(/[^a-zA-Z0-9]+/g, "_");
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function newKey() {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function emptyFinding(): Finding {
  return {
    key: newKey(),
    location: "",
    description: "",
    hazard: "",
    risk_level: "Medium",
    applicable_requirement: "",
    osha_standard: "",
    evidence: "",
    images: [],
    current_status: "",
    immediate_action: "",
    corrective_action: "",
    responsible_person: "",
    target_date: "",
    follow_up: "",
  };
}

const riskBadge = (level: string) =>
  level === "Critical"
    ? "bg-red-500/20 border-red-500/40 text-red-300"
    : level === "High"
    ? "bg-orange-500/20 border-orange-500/40 text-orange-300"
    : level === "Medium"
    ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
    : "bg-emerald-500/15 border-emerald-500/30 text-emerald-300";

const statusBadge = (s: string) =>
  s === "Published"
    ? "bg-green-500/20 text-green-300"
    : "bg-slate-500/20 text-slate-300";

export default function HazardRiskPage() {
  const supabase = createClient();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [reports, setReports] = useState<HazardReport[]>([]);
  const [loading, setLoading] = useState(true);

  const [branchFilter, setBranchFilter] = useState("");
  const [openBranch, setOpenBranch] = useState<string | null>(null);
  const [openReport, setOpenReport] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [fBranch, setFBranch] = useState("");
  const [fTitle, setFTitle] = useState("");
  const [fDate, setFDate] = useState(todayStr());
  const [fResponsible, setFResponsible] = useState("");
  const [fAuditor, setFAuditor] = useState("");
  const [fSignature, setFSignature] = useState("");
  const [userName, setUserName] = useState("");
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState<Finding>(emptyFinding());
  const [findingSaving, setFindingSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [pubBusyId, setPubBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: b }, { data: r }] = await Promise.all([
      supabase.from("branches").select("id,name,branch_manager").order("name"),
      supabase.from("hazard_reports").select("*, branches(name)").order("report_date", { ascending: false }),
    ]);
    setBranches(b || []);
    setReports(
      (r || []).map((x: any) => ({
        id: x.id,
        branch_id: x.branch_id,
        title: x.title,
        report_date: x.report_date,
        responsible_person: x.responsible_person || null,
        auditor_name: x.auditor_name || null,
        auditor_signature: x.auditor_signature || null,
        status: x.status || "Draft",
        findings: Array.isArray(x.findings) ? x.findings : [],
        publish_history: Array.isArray(x.publish_history) ? x.publish_history : [],
        pdf_url: x.pdf_url || null,
        pdf_public_id: x.pdf_public_id || null,
        created_at: x.created_at,
        updated_at: x.updated_at,
        branch_name: x.branches?.name || "",
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const full = data?.user?.user_metadata?.full_name as string | undefined;
      if (full) {
        setUserName(full);
        if (!fResponsible) setFResponsible(full);
        if (!fAuditor) setFAuditor(full);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 3500); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 5000); }

  const branchColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    branches.forEach((b, i) => { map[b.id] = BRANCH_COLORS[i % BRANCH_COLORS.length]; });
    return map;
  }, [branches]);

  const byBranch = useMemo(() => {
    const map: Record<string, HazardReport[]> = {};
    reports.forEach((r) => {
      if (!map[r.branch_id]) map[r.branch_id] = [];
      map[r.branch_id].push(r);
    });
    return map;
  }, [reports]);

  const shownBranches = branchFilter ? branches.filter((b) => b.id === branchFilter) : branches;

  function resetForm() {
    setEditingId(null);
    setFBranch("");
    setFTitle("");
    setFDate(todayStr());
    setFResponsible("");
    setFAuditor(userName);
    setFSignature("");
  }

  function onSelectBranch(id: string) {
    setFBranch(id);
    const b = branches.find((x) => x.id === id);
    if (b?.branch_manager && !editingId) setFResponsible(b.branch_manager);
  }

  async function handleSaveReport() {
    if (!editingId && !fBranch) return showErr("Select a branch.");
    if (!fTitle.trim()) return showErr("Enter a report title.");
    if (!fDate) return showErr("Select a report date.");
    setSaving(true);
    if (editingId) {
      const { error: err } = await supabase
        .from("hazard_reports")
        .update({
          title: fTitle.trim(),
          report_date: fDate,
          responsible_person: fResponsible.trim() || null,
          auditor_name: fAuditor.trim() || null,
          auditor_signature: fSignature || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingId);
      setSaving(false);
      if (err) return showErr(err.message);
      showMsg("Report updated.");
      resetForm();
    } else {
      const { data, error: err } = await supabase
        .from("hazard_reports")
        .insert({
          branch_id: fBranch,
          title: fTitle.trim(),
          report_date: fDate,
          responsible_person: fResponsible.trim() || null,
          auditor_name: fAuditor.trim() || null,
          auditor_signature: fSignature || null,
          status: "Draft",
          findings: [],
          publish_history: [],
        })
        .select("id")
        .single();
      setSaving(false);
      if (err) return showErr(err.message);
      showMsg("Report created. Open it to add findings.");
      setOpenBranch(fBranch);
      if (data?.id) setOpenReport(data.id);
      resetForm();
    }
    fetchData();
  }

  function beginEdit(rep: HazardReport) {
    setEditingId(rep.id);
    setFBranch(rep.branch_id);
    setFTitle(rep.title);
    setFDate(rep.report_date);
    setFResponsible(rep.responsible_person || "");
    setFAuditor(rep.auditor_name || userName);
    setFSignature(rep.auditor_signature || "");
    setOpenReport(rep.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteReport(rep: HazardReport) {
    if (!confirm("Delete this hazard report, its findings, evidence images and its saved PDF?")) return;
    const pics = rep.findings.flatMap((f) => f.images || []);
    const { error: err } = await supabase.from("hazard_reports").delete().eq("id", rep.id);
    if (err) return showErr(err.message);
    await Promise.all(pics.map((u) => deleteDriveFileByUrl(u)));
    if (rep.pdf_url) await deleteDriveFileByUrl(rep.pdf_url);
    showMsg("Report deleted.");
    fetchData();
  }

  async function handleUploadImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) { showErr(`${file.name} is not an image.`); continue; }
      try {
        if (file.size > LARGE_UPLOAD_THRESHOLD) {
          const up = await uploadLargeFile("evidence", file);
          if (up.url) urls.push(up.url);
          continue;
        }
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/drive-upload-image", { method: "POST", body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.url) { showErr(driveErrorMessage(json, `${file.name} upload failed.`)); continue; }
        urls.push(json.url);
      } catch {
        showErr(`${file.name} upload failed.`);
      }
    }
    setDraft((d) => ({ ...d, images: [...d.images, ...urls] }));
    setUploading(false);
    if (urls.length) showMsg(`${urls.length} image${urls.length > 1 ? "s" : ""} uploaded to Google Drive.`);
  }

  async function removeDraftImage(url: string) {
    setDraft((d) => ({ ...d, images: d.images.filter((u) => u !== url) }));
    await deleteDriveFileByUrl(url);
  }

  function handleSignatureUpload(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return showErr("Signature must be an image file.");
    if (file.size > 2 * 1024 * 1024) return showErr("Signature image must be under 2MB.");
    const reader = new FileReader();
    reader.onload = () => setFSignature(String(reader.result));
    reader.onerror = () => showErr("Could not read the signature image.");
    reader.readAsDataURL(file);
  }

  async function addFinding(rep: HazardReport) {
    if (!draft.location.trim() && !draft.hazard.trim() && !draft.description.trim()) {
      return showErr("Fill in at least the Location, Description or Hazard.");
    }
    setFindingSaving(true);
    const f: Finding = { ...draft, key: draft.key || newKey(), responsible_person: draft.responsible_person.trim() || (rep.responsible_person || "") };
    const findings = [...rep.findings, f];
    const { error: err } = await supabase
      .from("hazard_reports")
      .update({ findings, updated_at: new Date().toISOString() })
      .eq("id", rep.id);
    setFindingSaving(false);
    if (err) return showErr(err.message);
    setDraft(emptyFinding());
    showMsg("Finding added.");
    fetchData();
  }

  async function deleteFinding(rep: HazardReport, key: string) {
    if (!confirm("Delete this finding and its images?")) return;
    const target = rep.findings.find((f) => f.key === key);
    const findings = rep.findings.filter((f) => f.key !== key);
    const { error: err } = await supabase
      .from("hazard_reports")
      .update({ findings, updated_at: new Date().toISOString() })
      .eq("id", rep.id);
    if (err) return showErr(err.message);
    await Promise.all((target?.images || []).map((u) => deleteDriveFileByUrl(u)));
    showMsg("Finding deleted.");
    fetchData();
  }

  async function publishReport(rep: HazardReport) {
    setPubBusyId(rep.id);
    setError("");
    try {
      const imageUrls = rep.findings.flatMap((f) => (f.images || []).map((u) => evidenceDisplayUrl(u)));
      await preloadPdfImages([LOGO, rep.auditor_signature || SIG_DEFAULT, ...imageUrls]);

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;
      const maxY = pageHeight - 12;
      let y = margin;
      const amber: [number, number, number] = [217, 119, 6];

      try {
        const logoUrl = await loadPdfImage(LOGO);
        doc.addImage(logoUrl, "JPEG", (pageWidth - 48) / 2, y, 48, 34);
      } catch { /* logo unavailable */ }

      y += 46;
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      for (const ln of doc.splitTextToSize(rep.title || "Hazard & Risk Analysis (OSHA)", maxWidth)) {
        doc.text(ln, pageWidth / 2, y, { align: "center" });
        y += 7;
      }
      y += 1;
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139);
      doc.text("Hazard & Risk Analysis (OSHA)", pageWidth / 2, y, { align: "center" });
      y += 8;

      const ensure = (needed: number) => {
        if (y + needed > maxY) { doc.addPage(); y = margin; }
      };
      const line = (t: string, size = 10, color: [number, number, number] = [30, 41, 59], gap = 5) => {
        doc.setFontSize(size);
        doc.setTextColor(color[0], color[1], color[2]);
        const lines = doc.splitTextToSize(t, maxWidth);
        const adv = size * 0.5;
        lines.forEach((ln: string) => { ensure(adv); doc.text(ln, margin, y); y += adv; });
        y += gap;
      };
      const sectionTitle = (t: string) => {
        if (y > maxY - 24) { doc.addPage(); y = margin; }
        doc.setFontSize(12);
        doc.setTextColor(amber[0], amber[1], amber[2]);
        doc.text(t, margin, y);
        y += 7;
        doc.setDrawColor(amber[0], amber[1], amber[2]);
        doc.line(margin, y, pageWidth - margin, y);
        y += 7;
      };

      autoTable(doc, {
        startY: y,
        theme: "grid",
        head: [["Field", "Value"]],
        body: [
          ["Branch", rep.branch_name || "—"],
          ["Report Date", fmtDate(rep.report_date)],
          ["Auditor", rep.auditor_name || "—"],
          ["Responsible Person", rep.responsible_person || "—"],
          ["Status", rep.status || "—"],
          ["Findings", String(rep.findings.length)],
          ["Published On", rep.publish_history.length ? rep.publish_history.map((d) => fmtDate(d)).join(", ") : "—"],
          ["Generated On", new Date().toLocaleString("en-GB")],
        ],
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: amber },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 12;

      if (rep.findings.length === 0) {
        line("No findings recorded in this report.", 10, [100, 116, 139]);
      }

      for (let i = 0; i < rep.findings.length; i++) {
        const f = rep.findings[i];
        sectionTitle(`Finding ${i + 1}${f.location ? `: ${f.location}` : ":"}`);
        const body = FIELDS.filter((fld) => String(f[fld.key] || "").trim()).map((fld) => [fld.label, String(f[fld.key] || "")]);
        if (body.length) {
          autoTable(doc, {
            startY: y,
            theme: "grid",
            head: [["Item", "Details"]],
            body,
            styles: { fontSize: 9, cellPadding: 2.5, valign: "top" },
            headStyles: { fillColor: amber },
            columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
            margin: { left: margin, right: margin },
          });
          y = (doc as any).lastAutoTable.finalY + 8;
        }

        const imgs = f.images || [];
        if (imgs.length) {
          const thumbW = 56;
          const thumbMaxH = 44;
          const gap = 8;
          const perRow = Math.max(1, Math.floor((maxWidth + gap) / (thumbW + gap)));
          let ex = margin;
          let ey = y;
          let placed = 0;
          for (const url of imgs) {
            if (placed > 0 && placed % perRow === 0) { ex = margin; ey += thumbMaxH + 8; }
            if (ey + thumbMaxH + 6 > maxY) { doc.addPage(); ex = margin; ey = margin; placed = 0; }
            let dataUrl = "";
            try { dataUrl = await loadPdfImage(evidenceDisplayUrl(url)); } catch { placed++; continue; }
            let w = thumbW;
            let h = thumbMaxH;
            try {
              doc.addImage(dataUrl, "JPEG", ex, ey, w, h);
            } catch { /* skip */ }
            doc.setDrawColor(148, 163, 184);
            doc.setLineWidth(0.2);
            doc.rect(ex, ey, w, h);
            ex += thumbW + gap;
            placed++;
          }
          y = ey + thumbMaxH + 10;
        }
        y += 4;
      }

      if (y > maxY - 60) { doc.addPage(); y = margin; }
      const colW = (maxWidth - 16) / 2;
      const leftX = margin;
      const rightX = margin + colW + 16;
      const sigY = y + 18;

      let sigData = "";
      try { sigData = await loadPdfImage(rep.auditor_signature || SIG_DEFAULT); } catch { /* signature unavailable */ }

      if (sigData) {
        try { doc.addImage(sigData, "JPEG", leftX, sigY - 16, 48, 15); } catch { /* skip */ }
      }
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.3);
      doc.line(leftX, sigY, leftX + colW, sigY);
      doc.line(rightX, sigY, rightX + colW, sigY);

      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.text(rep.auditor_name || "_________________", leftX, sigY + 5);
      doc.text(rep.responsible_person || "_________________", rightX, sigY + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("Auditor — Signature & Name", leftX, sigY + 10);
      doc.text("Responsible Person — Signature & Name", rightX, sigY + 10);

      y = sigY + 22;
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("Generated from the Quality Management System — Hazard & Risk Analysis (OSHA) module.", margin, y);

      const filename = `${sanitizeFile(rep.branch_name || "Branch")}_Hazard_Risk_Report_${sanitizeFile(rep.report_date || rep.id)}.pdf`;
      doc.save(filename);

      setPubBusyId(`${rep.id}:saving`);
      const blob = doc.output("blob");
      const formData = new FormData();
      formData.append("file", blob, filename);
      formData.append("folderKind", "report");
      const res = await fetch("/api/drive-upload", { method: "POST", body: formData });
      if (res.ok) {
        const json = await res.json();
        if (json.url) {
          const history = [...rep.publish_history, new Date().toISOString()];
          const { error: updErr } = await supabase
            .from("hazard_reports")
            .update({
              pdf_url: json.url,
              pdf_public_id: json.fileId || null,
              status: "Published",
              publish_history: history,
              updated_at: new Date().toISOString(),
            })
            .eq("id", rep.id);
          if (!updErr) {
            showMsg("Report published and saved to Google Drive.");
            fetchData();
          } else {
            showErr(updErr.message);
          }
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        showErr(driveErrorMessage(errJson, "PDF generated, but saving to Google Drive failed."));
      }
    } catch (e: any) {
      showErr(e?.message || "Could not generate the report.");
    } finally {
      setPubBusyId(null);
    }
  }

  const inputCls = "w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500";
  const selectCls = "w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 [color-scheme:dark]";
  const labelCls = "block text-sm text-amber-200/70 mb-1";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-amber-900/30 to-slate-950">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="mb-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to Dashboard
          </Link>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Hazard &amp; Risk Analysis (OSHA)</h1>
            <p className="text-amber-200/60">Branch-wise hazard identification and risk assessment. Add findings with evidence images, then publish a report to Google Drive.</p>
          </div>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 [color-scheme:dark]"
          >
            <option value="" className="bg-slate-800">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id} className="bg-slate-800">{b.name}</option>)}
          </select>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-amber-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-amber-400/20 rounded-2xl p-6 h-fit lg:sticky lg:top-6">
            <h2 className="text-lg font-semibold text-white mb-4">{editingId ? "Update Report" : "New Hazard Report"}</h2>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Branch</label>
                <select value={fBranch} onChange={(e) => onSelectBranch(e.target.value)} disabled={!!editingId} className={selectCls + (editingId ? " opacity-60" : "")}>
                  <option value="" className="bg-slate-800">Select branch...</option>
                  {branches.map((b) => <option key={b.id} value={b.id} className="bg-slate-800">{b.name}{b.branch_manager ? ` — ${b.branch_manager}` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Report title</label>
                <input type="text" value={fTitle} onChange={(e) => setFTitle(e.target.value)} placeholder="e.g. Warehouse Safety Inspection" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Report date</label>
                <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} className={inputCls + " [color-scheme:dark]"} />
              </div>
              <div>
                <label className={labelCls}>Responsible person</label>
                <input type="text" value={fResponsible} onChange={(e) => setFResponsible(e.target.value)} placeholder="Branch manager" className={inputCls} />
                <p className="text-[11px] text-amber-200/40 mt-1">Defaults to the selected branch&apos;s manager.</p>
              </div>
              <div>
                <label className={labelCls}>Auditor name</label>
                <input type="text" value={fAuditor} onChange={(e) => setFAuditor(e.target.value)} placeholder="Auditor full name" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Auditor signature</label>
                {fSignature ? (
                  <div className="flex items-center gap-3">
                    <img src={fSignature} alt="Signature" className="h-12 bg-white/90 rounded px-2" />
                    <button type="button" onClick={() => setFSignature("")} className="text-xs text-red-400 hover:text-red-300 transition-colors">Remove</button>
                  </div>
                ) : (
                  <label className="block cursor-pointer">
                    <div className="px-4 py-2.5 bg-white/5 border border-dashed border-white/15 rounded-lg text-sm text-amber-200/70 hover:border-amber-400/50 hover:text-amber-200 transition-colors text-center">
                      Upload signature image
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { handleSignatureUpload(e.target.files?.[0] || null); e.target.value = ""; }} />
                  </label>
                )}
                <p className="text-[11px] text-amber-200/40 mt-1">Leave empty to use the default signature.</p>
              </div>
              <button onClick={handleSaveReport} disabled={saving} className="w-full px-5 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-600/50 text-white font-medium rounded-lg transition-colors shadow-lg shadow-amber-600/25">
                {saving ? "Saving..." : editingId ? "Update Report" : "Create Report"}
              </button>
              {editingId && (
                <button onClick={resetForm} className="w-full px-5 py-2.5 text-sm text-white/70 hover:text-white bg-white/5 border border-white/10 rounded-lg transition-colors">
                  Cancel editing
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {loading ? (
              <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>
            ) : shownBranches.length === 0 ? (
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-12 text-center">
                <p className="text-amber-200/40">No branches found.</p>
              </div>
            ) : (
              shownBranches.map((b) => {
                const list = byBranch[b.id] || [];
                const isOpen = openBranch === b.id;
                return (
                  <div key={b.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setOpenBranch(isOpen ? null : b.id)}
                      className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-white/5 transition-colors"
                    >
                      <div className={`w-2.5 h-2.5 rounded-full ${branchColorMap[b.id]}`} />
                      <span className="text-white font-semibold">{b.name}</span>
                      <span className="text-xs text-amber-200/40">{b.branch_manager ? b.branch_manager : "No manager"}</span>
                      <span className="ml-auto text-xs text-amber-200/50">{list.length} report{list.length === 1 ? "" : "s"}</span>
                      <svg className={`w-4 h-4 text-amber-200/50 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                    </button>

                    {isOpen && (
                      <div className="border-t border-white/10 divide-y divide-white/5">
                        <div className="p-4">
                          <button onClick={() => { setFBranch(b.id); setFResponsible(b.branch_manager || ""); setFTitle(""); setFDate(todayStr()); setEditingId(null); setFAuditor(userName); setFSignature(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="px-3 py-1.5 text-xs rounded-lg bg-amber-600/30 border border-amber-500/40 text-amber-200 hover:bg-amber-600/50 transition-colors">
                            + New report for {b.name}
                          </button>
                        </div>

                        {list.length === 0 ? (
                          <p className="px-5 py-6 text-sm text-amber-200/40">No hazard reports for this branch yet.</p>
                        ) : (
                          list.map((rep) => {
                            const expanded = openReport === rep.id;
                            return (
                              <div key={rep.id} className="p-4 sm:p-5">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="text-white font-medium break-words">{rep.title}</span>
                                      <span className={`px-2 py-0.5 text-[10px] rounded-full ${statusBadge(rep.status)}`}>{rep.status}</span>
                                    </div>
                                    <p className="text-xs text-amber-200/40 mt-1">
                                      {fmtDate(rep.report_date)}
                                      {rep.responsible_person ? ` · ${rep.responsible_person}` : ""}
                                      {rep.auditor_name ? ` · Auditor: ${rep.auditor_name}` : ""}
                                      {` · ${rep.findings.length} finding${rep.findings.length === 1 ? "" : "s"}`}
                                      {` · ${rep.findings.reduce((s, f) => s + (f.images?.length || 0), 0)} image(s)`}
                                    </p>
                                    {rep.publish_history.length > 0 && (
                                      <p className="text-[11px] text-green-300/80 mt-1">
                                        Published: {rep.publish_history.map((d) => fmtDate(d)).join(", ")}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <button onClick={() => setOpenReport(expanded ? null : rep.id)} className="px-3 py-1.5 text-xs rounded-lg bg-amber-600/30 border border-amber-500/40 text-amber-200 hover:bg-amber-600/50 transition-colors">
                                      {expanded ? "Close" : "Open"}
                                    </button>
                                    <button onClick={() => beginEdit(rep)} className="px-3 py-1.5 text-xs rounded-lg bg-white/10 border border-white/15 text-white/80 hover:bg-white/15 transition-colors">
                                      Update
                                    </button>
                                    <button onClick={() => publishReport(rep)} disabled={pubBusyId === rep.id || pubBusyId === `${rep.id}:saving`} className="px-3 py-1.5 text-xs rounded-lg bg-green-600/30 border border-green-500/40 text-green-200 hover:bg-green-600/50 disabled:opacity-50 transition-colors">
                                      {pubBusyId === rep.id ? "Generating..." : pubBusyId === `${rep.id}:saving` ? "Publishing..." : "Publish"}
                                    </button>
                                    {rep.pdf_url && (
                                      <a href={rep.pdf_url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs rounded-lg bg-white/10 border border-white/15 text-white/70 hover:bg-white/15 transition-colors">
                                        Open PDF
                                      </a>
                                    )}
                                    <button onClick={() => handleDeleteReport(rep)} className="text-xs text-red-400 hover:text-red-300 transition-colors">Delete</button>
                                  </div>
                                </div>

                                {expanded && (
                                  <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
                                    {rep.findings.length === 0 && (
                                      <p className="text-xs text-amber-200/40">No findings yet. Add the first one below.</p>
                                    )}

                                    {rep.findings.map((f, idx) => (
                                      <div key={f.key} className="bg-white/5 border border-white/10 rounded-xl p-4">
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-white font-medium text-sm">Finding {idx + 1}{f.location ? ` — ${f.location}` : ""}</span>
                                            {f.risk_level && <span className={`px-2 py-0.5 text-[10px] rounded-full border ${riskBadge(f.risk_level)}`}>{f.risk_level}</span>}
                                          </div>
                                          <button onClick={() => deleteFinding(rep, f.key)} className="text-xs text-red-400/70 hover:text-red-300 transition-colors shrink-0">Delete</button>
                                        </div>
                                        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                                          {FIELDS.filter((fld) => fld.key !== "location" && fld.key !== "risk_level" && String(f[fld.key] || "").trim()).map((fld) => (
                                            <div key={fld.key} className={fld.long ? "sm:col-span-2" : ""}>
                                              <dt className="text-[11px] text-amber-200/50">{fld.label}</dt>
                                              <dd className="text-sm text-white/85 whitespace-pre-wrap break-words">{String(f[fld.key] || "")}</dd>
                                            </div>
                                          ))}
                                        </dl>
                                        {f.images?.length > 0 && (
                                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-3">
                                            {f.images.map((u) => (
                                              <EvidenceThumb key={u} url={u} className="w-full h-40 object-cover rounded-lg border border-white/10 hover:border-amber-400/50 transition-colors" />
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))}

                                    <div className="bg-white/5 border border-amber-500/20 rounded-xl p-4">
                                      <p className="text-sm font-medium text-white mb-3">Add finding</p>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {FIELDS.map((fld) => (
                                          <div key={fld.key} className={fld.long ? "sm:col-span-2" : ""}>
                                            <label className={labelCls}>{fld.label}</label>
                                            {fld.key === "risk_level" ? (
                                              <select value={draft.risk_level} onChange={(e) => setDraft((d) => ({ ...d, risk_level: e.target.value }))} className={selectCls}>
                                                {RISK_LEVELS.map((r) => <option key={r} value={r} className="bg-slate-800">{r}</option>)}
                                              </select>
                                            ) : fld.key === "current_status" ? (
                                              <select value={draft.current_status} onChange={(e) => setDraft((d) => ({ ...d, current_status: e.target.value }))} className={selectCls}>
                                                <option value="" className="bg-slate-800">Select...</option>
                                                {NON_CONFORMANCE_OPTIONS.map((o) => <option key={o} value={o} className="bg-slate-800">{o}</option>)}
                                              </select>
                                            ) : fld.long ? (
                                              <textarea rows={2} value={String(draft[fld.key] || "")} onChange={(e) => setDraft((d) => ({ ...d, [fld.key]: e.target.value }))} placeholder={fld.key === "responsible_person" ? (rep.responsible_person || "Branch manager") : ""} className={inputCls + " resize-none"} />
                                            ) : (
                                              <input type="text" value={String(draft[fld.key] || "")} onChange={(e) => setDraft((d) => ({ ...d, [fld.key]: e.target.value }))} placeholder={fld.key === "responsible_person" ? (rep.responsible_person || "Branch manager") : ""} className={inputCls} />
                                            )}
                                          </div>
                                        ))}
                                      </div>

                                      <label className="block cursor-pointer mt-3">
                                        <div className="px-4 py-2.5 bg-white/5 border border-dashed border-white/15 rounded-lg text-sm text-amber-200/70 hover:border-amber-400/50 hover:text-amber-200 transition-colors text-center">
                                          {uploading ? "Uploading images to Google Drive..." : "Upload evidence images (photos)"}
                                        </div>
                                        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { handleUploadImages(e.target.files); e.target.value = ""; }} />
                                      </label>

                                      {draft.images.length > 0 && (
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                                          {draft.images.map((u) => (
                                            <div key={u} className="relative group">
                                              <EvidenceThumb url={u} className="w-full h-32 object-cover rounded-lg border border-white/10" />
                                              <button onClick={() => removeDraftImage(u)} className="absolute top-1 right-1 z-10 px-1.5 py-0.5 text-[10px] rounded bg-black/70 text-red-300 opacity-0 group-hover:opacity-100 transition-opacity">Remove</button>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      <button onClick={() => addFinding(rep)} disabled={findingSaving} className="mt-3 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-600/50 text-white text-sm font-medium rounded-lg transition-colors">
                                        {findingSaving ? "Saving..." : "Save Finding"}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
