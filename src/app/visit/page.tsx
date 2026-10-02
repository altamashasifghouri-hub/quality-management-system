"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import { deleteDriveFileByUrl } from "@/lib/drive-file";
import { driveErrorMessage } from "@/lib/drive-error";
import { loadPdfImage, imageDims, zoomUrl } from "@/lib/pdf-image";

interface Branch { id: string; name: string; }

interface Observation {
  key: string;
  area: string;
  context: string;
  outcome: string;
  pictures: string[];
}

interface VisitRecord {
  id: string;
  branch_id: string;
  visit_date: string;
  purpose: string | null;
  context: string | null;
  visited_by: string | null;
  status: string;
  observations: Observation[];
  created_at: string;
  updated_at: string;
  pdf_url?: string | null;
  pdf_public_id?: string | null;
  signature?: string | null;
  branch_name?: string;
}

const LOGO = "/logo.jpg";
const SIG_DEFAULT = "/signature.png";

function sanitizeFile(name: string) {
  return name.replace(/[^a-zA-Z0-9]+/g, "_");
}

const OUTCOMES = ["Observation", "Compliant", "Follow-up"];
const BRANCH_COLORS = ["bg-emerald-500", "bg-teal-500", "bg-amber-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500", "bg-orange-500"];

const statusBadge = (s: string) =>
  s === "Closed"
    ? "bg-slate-500/20 text-slate-300"
    : s === "In Progress"
    ? "bg-amber-500/20 text-amber-300"
    : "bg-emerald-500/20 text-emerald-300";

const outcomeBadge = (o: string) =>
  o === "Compliant"
    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
    : o === "Follow-up"
    ? "bg-sky-500/15 border-sky-500/30 text-sky-300"
    : "bg-amber-500/20 border-amber-500/30 text-amber-300";

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
  return `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export default function VisitManagementPage() {
  const supabase = createClient();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [records, setRecords] = useState<VisitRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [branchFilter, setBranchFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const [vBranch, setVBranch] = useState("");
  const [vDate, setVDate] = useState(todayStr());
  const [vPurpose, setVPurpose] = useState("");
  const [vBy, setVBy] = useState("");
  const [vContext, setVContext] = useState("");
  const [saving, setSaving] = useState(false);

  const [oArea, setOArea] = useState("");
  const [oContext, setOContext] = useState("");
  const [oOutcome, setOOutcome] = useState(OUTCOMES[0]);
  const [oPictures, setOPictures] = useState<string[]>([]);
  const [oSaving, setOSaving] = useState(false);
  const [oUploading, setOUploading] = useState(false);

  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [sigBusyId, setSigBusyId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: b }, { data: v }] = await Promise.all([
      supabase.from("branches").select("id,name").order("name"),
      supabase.from("visit_records").select("*, branches(name)").order("visit_date", { ascending: false }),
    ]);
    setBranches(b || []);
    setRecords(
      (v || []).map((x: any) => ({
        id: x.id,
        branch_id: x.branch_id,
        visit_date: x.visit_date,
        purpose: x.purpose,
        context: x.context,
        visited_by: x.visited_by,
        status: x.status,
        observations: Array.isArray(x.observations) ? x.observations : [],
        created_at: x.created_at,
        updated_at: x.updated_at,
        pdf_url: x.pdf_url || null,
        pdf_public_id: x.pdf_public_id || null,
        signature: x.signature || null,
        branch_name: x.branches?.name || "",
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.user_metadata?.full_name) setVBy(data.user.user_metadata.full_name);
    });
  }, [supabase]);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 3500); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 4500); }

  const branchColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    branches.forEach((b, i) => { map[b.id] = BRANCH_COLORS[i % BRANCH_COLORS.length]; });
    return map;
  }, [branches]);

  const byBranch = useMemo(() => {
    const map: Record<string, VisitRecord[]> = {};
    records.forEach((r) => {
      const key = r.branch_name || "Unassigned";
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return map;
  }, [records]);

  const shownBranches = branchFilter
    ? branches.filter((b) => b.id === branchFilter)
    : branches;

  async function handleCreateVisit() {
    if (!vBranch) return showErr("Select a branch.");
    if (!vDate) return showErr("Select a visit date.");
    if (!vPurpose.trim()) return showErr("Enter the purpose of the visit.");
    setSaving(true);
    const { error: err } = await supabase.from("visit_records").insert({
      branch_id: vBranch,
      visit_date: vDate,
      purpose: vPurpose.trim(),
      context: vContext.trim() || null,
      visited_by: vBy.trim() || null,
      status: "Open",
      observations: [],
    });
    setSaving(false);
    if (err) return showErr(err.message);
    setVPurpose(""); setVContext(""); setVDate(todayStr());
    showMsg("Visit record created. Add evidence below.");
    setOpenId(null);
    fetchData();
  }

  async function handleDeleteVisit(id: string) {
    const rec = records.find((r) => r.id === id);
    if (!rec) return;
    if (!confirm("Delete this visit record, its evidence notes, and its saved PDF?")) return;
    const pics = rec.observations.flatMap((o) => o.pictures || []);
    const { error: err } = await supabase.from("visit_records").delete().eq("id", id);
    if (err) return showErr(err.message);
    await Promise.all(pics.map((u) => deleteDriveFileByUrl(u)));
    if (rec.pdf_url) await deleteDriveFileByUrl(rec.pdf_url);
    showMsg("Visit record deleted.");
    fetchData();
  }

  async function generateVisitPdf(rec: VisitRecord) {
    setPdfBusyId(rec.id);
    setError("");
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;
      const maxY = pageHeight - 12;
      let y = margin;

      const green: [number, number, number] = [5, 150, 105];

      try {
        const logoUrl = await loadPdfImage(LOGO);
        doc.addImage(logoUrl, "JPEG", (pageWidth - 48) / 2, y, 48, 34);
      } catch {
        /* logo unavailable */
      }

      y += 48;
      doc.setFontSize(16);
      doc.setTextColor(15, 23, 42);
      doc.text("VISIT EVIDENCE REPORT", pageWidth / 2, y, { align: "center" });
      y += 8;
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Reference No: QMS/VE/${rec.visit_date?.replace(/-/g, "/") || "—"}/${sanitizeFile(rec.purpose || rec.id).slice(0, 12)}`,
        pageWidth - margin,
        y,
        { align: "right" }
      );
      y += 14;

      const ensure = (needed: number) => {
        if (y + needed > maxY) {
          doc.addPage();
          y = margin;
        }
      };

      const line = (t: string, size = 10, color: [number, number, number] = [30, 41, 59], gap = 5) => {
        doc.setFontSize(size);
        doc.setTextColor(color[0], color[1], color[2]);
        const lines = doc.splitTextToSize(t, maxWidth);
        const adv = size * 0.5;
        lines.forEach((ln: string) => {
          ensure(adv);
          doc.text(ln, margin, y);
          y += adv;
        });
        y += gap;
      };

      const sectionTitle = (t: string) => {
        if (y > maxY - 24) {
          doc.addPage();
          y = margin;
        }
        doc.setFontSize(12);
        doc.setTextColor(green[0], green[1], green[2]);
        doc.text(t, margin, y);
        y += 7;
        doc.setDrawColor(green[0], green[1], green[2]);
        doc.line(margin, y, pageWidth - margin, y);
        y += 7;
      };

      const totalPics = rec.observations.reduce((s, o) => s + (o.pictures?.length || 0), 0);

      autoTable(doc, {
        startY: y,
        theme: "grid",
        head: [["Field", "Value"]],
        body: [
          ["Branch", rec.branch_name || "—"],
          ["Visit Date", fmtDate(rec.visit_date)],
          ["Purpose", rec.purpose || "—"],
          ["Visited By", rec.visited_by || "—"],
          ["Status", rec.status || "—"],
          ["Evidence Notes", String(rec.observations.length)],
          ["Picture Evidence", String(totalPics)],
          ["Generated On", new Date().toLocaleString("en-GB")],
        ],
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: green },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      if (rec.context) {
        sectionTitle("1. Visit Context");
        line(rec.context, 10, [51, 65, 85]);
      }

      const evidenceTitle = rec.context ? "2. Evidence Details" : "1. Evidence Details";
      sectionTitle(evidenceTitle);

      if (rec.observations.length === 0) {
        line("No evidence recorded for this visit.", 10, [100, 116, 139]);
      }

      for (let i = 0; i < rec.observations.length; i++) {
        const o = rec.observations[i];
        if (y > maxY - 20) {
          doc.addPage();
          y = margin;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(green[0], green[1], green[2]);
        const head = `Evidence ${String(i + 1).padStart(2, "0")}${o.area ? ` — ${o.area}` : ""}  [${o.outcome}]`;
        for (const ln of doc.splitTextToSize(head, maxWidth)) {
          ensure(5.5);
          doc.text(ln, margin, y);
          y += 5.5;
        }
        doc.setFont("helvetica", "normal");
        y += 2;

        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59);
        for (const ln of doc.splitTextToSize(o.context, maxWidth)) {
          ensure(4.8);
          doc.text(ln, margin, y);
          y += 4.8;
        }
        y += 4;

        const pics = o.pictures || [];
        if (pics.length > 0) {
          const thumbW = 56;
          const thumbMaxH = 44;
          const gap = 8;
          const perRow = Math.max(1, Math.floor((maxWidth + gap) / (thumbW + gap)));
          let ex = margin;
          let ey = y;
          let placed = 0;
          for (const url of pics) {
            if (placed > 0 && placed % perRow === 0) {
              ex = margin;
              ey += thumbMaxH + 8;
            }
            if (ey + thumbMaxH + 6 > maxY) {
              doc.addPage();
              ex = margin;
              ey = margin;
              placed = 0;
            }
            let dataUrl = "";
            try {
              dataUrl = await loadPdfImage(url);
            } catch {
              placed++;
              continue;
            }
            let dw = 1;
            let dh = 1;
            try {
              const dims = await imageDims(dataUrl);
              dw = dims.width;
              dh = dims.height;
            } catch {
              /* keep 1:1 */
            }
            let w = thumbW;
            let h = (thumbW * dh) / (dw || 1);
            if (h > thumbMaxH) {
              h = thumbMaxH;
              w = (h * dw) / (dh || 1);
            }
            const iy = ey + (thumbMaxH - h) / 2;
            doc.addImage(dataUrl, "JPEG", ex, iy, w, h);
            doc.setDrawColor(148, 163, 184);
            doc.setLineWidth(0.2);
            doc.rect(ex, iy, w, h);
            doc.link(ex, iy, w, h, { url: zoomUrl(url) });
            doc.setFontSize(7.5);
            doc.setTextColor(100, 116, 139);
            doc.text("Click for full view", ex + w / 2, iy + h + 3, { align: "center" });
            ex += thumbW + gap;
            placed++;
          }
          y = ey + thumbMaxH + 10;
        }
        y += 4;
        if (y <= maxY - 4) {
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.15);
          doc.line(margin, y, pageWidth - margin, y);
        }
        y += 7;
      }

      sectionTitle(`${rec.context ? "3" : "2"}. Evidence Summary`);
      if (y > maxY - 14) {
        doc.addPage();
        y = margin;
      }
      const byOutcome = OUTCOMES.map((oc) => {
        const refs: number[] = [];
        rec.observations.forEach((o, idx) => {
          if (o.outcome === oc) refs.push(idx + 1);
        });
        const pics = rec.observations.filter((o) => o.outcome === oc).reduce((s, o) => s + (o.pictures?.length || 0), 0);
        return [oc, String(refs.length), String(pics), refs.map((n) => String(n).padStart(2, "0")).join(", ") || "—"];
      });
      byOutcome.push([
        "Total",
        String(rec.observations.length),
        String(totalPics),
        "",
      ]);
      autoTable(doc, {
        startY: y,
        theme: "grid",
        head: [["Outcome", "Notes", "Pictures", "References"]],
        body: byOutcome,
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: green },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 40 } },
        margin: { left: margin, right: margin },
      });
      y = (doc as any).lastAutoTable.finalY + 16;

      if (y > maxY - 52) {
        doc.addPage();
        y = margin;
      }
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      doc.text(`Prepared by: ${rec.visited_by || "_______________"}`, margin, y);
      doc.text(`Visit Date: ${fmtDate(rec.visit_date)}`, pageWidth - margin, y, { align: "right" });
      y += 8;
      const sigUrl = rec.signature || SIG_DEFAULT;
      let sigPlaced = false;
      try {
        const sigData = await loadPdfImage(sigUrl);
        doc.addImage(sigData, "JPEG", margin, y, 45, 22);
        sigPlaced = true;
      } catch {
        /* signature image unavailable */
      }
      if (sigPlaced) {
        doc.setDrawColor(30, 41, 59);
        doc.setLineWidth(0.3);
        doc.line(margin, y + 24, margin + 55, y + 24);
      }
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("Signature", margin + 7, y + (sigPlaced ? 29 : 14));
      y += sigPlaced ? 40 : 24;

      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("Generated from the Quality Management System — Visit Management module.", margin, y);
      doc.text(
        "Picture evidence is stored in Google Drive; click any thumbnail in the PDF to open the full-size image.",
        margin,
        y + 4
      );

      const filename = `Visit_Evidence_${sanitizeFile(rec.branch_name || "Branch")}_${sanitizeFile(rec.purpose || rec.id)}.pdf`;
      doc.save(filename);

      setPdfBusyId(`${rec.id}:saving`);
      try {
        const blob = doc.output("blob");
        const formData = new FormData();
        formData.append("file", blob, filename);
        formData.append("folderKind", "evidence");
        const res = await fetch("/api/drive-upload", { method: "POST", body: formData });
        if (res.ok) {
          const json = await res.json();
          if (json.url) {
            if (rec.pdf_url) await deleteDriveFileByUrl(rec.pdf_url);
            const { error: updErr } = await supabase
              .from("visit_records")
              .update({ pdf_url: json.url, pdf_public_id: json.fileId || null, updated_at: new Date().toISOString() })
              .eq("id", rec.id);
            if (!updErr) {
              showMsg("PDF generated and saved to Google Drive.");
              fetchData();
            }
          }
        } else {
          const errJson = await res.json().catch(() => ({}));
          showErr(driveErrorMessage(errJson, "PDF downloaded, but saving to Google Drive failed."));
        }
      } catch {
        showErr("PDF downloaded, but saving to Google Drive failed.");
      } finally {
        setPdfBusyId(null);
      }
    } catch (e: any) {
      showErr(e?.message || "Could not generate PDF.");
      setPdfBusyId(null);
    }
  }

  async function handleOpenSavedPdf(rec: VisitRecord) {
    if (!rec.pdf_url) return;
    window.open(rec.pdf_url, "_blank", "noopener");
  }

  async function handleSignatureUpload(visitId: string, file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return showErr("Signature must be an image file.");
    if (file.size > 2 * 1024 * 1024) return showErr("Signature image must be under 2MB.");
    setSigBusyId(visitId);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.readAsDataURL(file);
    }).catch(() => "");
    setSigBusyId(null);
    if (!dataUrl) return showErr("Could not read the signature image.");
    const { error: err } = await supabase
      .from("visit_records")
      .update({ signature: dataUrl, updated_at: new Date().toISOString() })
      .eq("id", visitId);
    if (err) return showErr(err.message);
    showMsg("Signature saved for this visit.");
    fetchData();
  }

  async function handleClearSignature(visitId: string) {
    const { error: err } = await supabase
      .from("visit_records")
      .update({ signature: null, updated_at: new Date().toISOString() })
      .eq("id", visitId);
    if (err) return showErr(err.message);
    showMsg("Signature reset to default.");
    fetchData();
  }

  async function handleStatusChange(id: string, status: string) {
    const { error: err } = await supabase
      .from("visit_records")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (err) return showErr(err.message);
    fetchData();
  }

  async function handleUploadPictures(files: FileList | null) {
    if (!files || files.length === 0) return;
    setOUploading(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        showErr(`${file.name} is not an image.`);
        continue;
      }
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/drive-upload-image", { method: "POST", body: fd });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          showErr(driveErrorMessage(errJson, `${file.name} upload failed.`));
          continue;
        }
        const json = await res.json();
        if (json.url) urls.push(json.url);
      } catch {
        showErr(`${file.name} upload failed.`);
      }
    }
    setOPictures((prev) => [...prev, ...urls]);
    setOUploading(false);
    if (urls.length) showMsg(`${urls.length} picture${urls.length > 1 ? "s" : ""} uploaded to Google Drive.`);
  }

  async function handleRemovePicture(url: string) {
    setOPictures((prev) => prev.filter((u) => u !== url));
    await deleteDriveFileByUrl(url);
  }

  async function handleAddObservation(visitId: string) {
    if (!oContext.trim()) return showErr("Write the context of the evidence.");
    setOSaving(true);
    const rec = records.find((r) => r.id === visitId);
    const obs: Observation[] = rec ? [...rec.observations] : [];
    obs.push({ key: newKey(), area: oArea.trim(), context: oContext.trim(), outcome: oOutcome, pictures: oPictures });
    const { error: err } = await supabase
      .from("visit_records")
      .update({ observations: obs, updated_at: new Date().toISOString() })
      .eq("id", visitId);
    setOSaving(false);
    if (err) return showErr(err.message);
    setOArea(""); setOContext(""); setOPictures([]);
    showMsg("Evidence added.");
    fetchData();
  }

  async function handleDeleteObservation(visitId: string, key: string) {
    const rec = records.find((r) => r.id === visitId);
    if (!rec) return;
    if (!confirm("Delete this evidence note and its pictures?")) return;
    const target = rec.observations.find((o) => o.key === key);
    const obs = rec.observations.filter((o) => o.key !== key);
    const { error: err } = await supabase
      .from("visit_records")
      .update({ observations: obs, updated_at: new Date().toISOString() })
      .eq("id", visitId);
    if (err) return showErr(err.message);
    await Promise.all((target?.pictures || []).map((u) => deleteDriveFileByUrl(u)));
    showMsg("Evidence deleted.");
    fetchData();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-emerald-900/70 to-slate-950">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="mb-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to Dashboard
          </Link>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Visit Management</h1>
            <p className="text-emerald-200/60">Branch-wise visit records with written context and picture evidence stored in Google Drive. Use PDF on any visit to export a report.</p>
          </div>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 [color-scheme:dark]"
          >
            <option value="" className="bg-slate-800">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id} className="bg-slate-800">{b.name}</option>)}
          </select>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-emerald-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-emerald-400/20 rounded-2xl p-6 h-fit">
            <h2 className="text-lg font-semibold text-white mb-4">New Visit Record</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-emerald-200/70 mb-1">Branch</label>
                <select value={vBranch} onChange={(e) => setVBranch(e.target.value)} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 [color-scheme:dark]">
                  <option value="" className="bg-slate-800">Select branch...</option>
                  {branches.map((b) => <option key={b.id} value={b.id} className="bg-slate-800">{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-emerald-200/70 mb-1">Visit date</label>
                <input type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 [color-scheme:dark]" />
              </div>
              <div>
                <label className="block text-sm text-emerald-200/70 mb-1">Purpose</label>
                <input type="text" value={vPurpose} onChange={(e) => setVPurpose(e.target.value)} placeholder="e.g. Monthly quality walkthrough" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm text-emerald-200/70 mb-1">Visited by</label>
                <input type="text" value={vBy} onChange={(e) => setVBy(e.target.value)} placeholder="Name" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-sm text-emerald-200/70 mb-1">Visit context</label>
                <textarea value={vContext} onChange={(e) => setVContext(e.target.value)} rows={3} placeholder="Background of this visit..." className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
              </div>
              <button onClick={handleCreateVisit} disabled={saving} className="w-full px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white font-medium rounded-lg transition-colors shadow-lg shadow-emerald-600/25">
                {saving ? "Saving..." : "Create Visit Record"}
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-5">
            {loading ? (
              <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /></div>
            ) : records.length === 0 ? (
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-12 text-center">
                <p className="text-emerald-200/40">No visit records yet. Create one to start collecting branch-wise evidence.</p>
              </div>
            ) : (
              shownBranches.map((b) => {
                const list = byBranch[b.name] || [];
                if (list.length === 0) return null;
                return (
                  <div key={b.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-white/10 flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${branchColorMap[b.id]}`} />
                      <h3 className="text-white font-semibold">{b.name}</h3>
                      <span className="text-xs text-emerald-200/40">{list.length} visit{list.length === 1 ? "" : "s"}</span>
                    </div>

                    <div className="divide-y divide-white/5">
                      {list.map((r) => {
                        const isOpen = openId === r.id;
                        return (
                          <div key={r.id} className="p-4 sm:p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-white font-medium">{r.purpose}</span>
                                  <span className={`px-2 py-0.5 text-[10px] rounded-full ${statusBadge(r.status)}`}>{r.status}</span>
                                  <span className="text-xs text-emerald-200/40">{fmtDate(r.visit_date)}{r.visited_by ? ` · ${r.visited_by}` : ""}</span>
                                </div>
                                {r.context && <p className="text-sm text-emerald-100/70 mt-1.5 break-words">{r.context}</p>}
                                <p className="text-xs text-emerald-200/40 mt-1">
                                  {r.observations.length} evidence note{r.observations.length === 1 ? "" : "s"} · {r.observations.reduce((s, o) => s + (o.pictures?.length || 0), 0)} picture(s)
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <select
                                  value={r.status}
                                  onChange={(e) => handleStatusChange(r.id, e.target.value)}
                                  className="px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 [color-scheme:dark]"
                                >
                                  <option value="Open" className="bg-slate-800">Open</option>
                                  <option value="In Progress" className="bg-slate-800">In Progress</option>
                                  <option value="Closed" className="bg-slate-800">Closed</option>
                                </select>
                                <button onClick={() => setOpenId(isOpen ? null : r.id)} className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-600/50 transition-colors">
                                  {isOpen ? "Close" : "Evidence"}
                                </button>
                                <button
                                  onClick={() => generateVisitPdf(r)}
                                  disabled={pdfBusyId === r.id}
                                  title={r.pdf_url ? "Saved in Google Drive — generates a fresh copy" : "Generate PDF and save to Google Drive"}
                                  className="px-3 py-1.5 text-xs rounded-lg bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-600/50 disabled:opacity-50 transition-colors"
                                >
                                  {pdfBusyId === r.id ? "Generating..." : "PDF"}
                                </button>
                                {r.pdf_url && (
                                  <button
                                    onClick={() => handleOpenSavedPdf(r)}
                                    title="Open the PDF saved in Google Drive"
                                    className="px-3 py-1.5 text-xs rounded-lg bg-white/10 border border-white/15 text-white/70 hover:bg-white/15 transition-colors"
                                  >
                                    Open PDF
                                  </button>
                                )}
                                <button onClick={() => handleDeleteVisit(r.id)} className="text-xs text-red-400 hover:text-red-300 transition-colors">Delete</button>
                              </div>
                            </div>

                            {isOpen && (
                              <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
                                {r.observations.length === 0 && (
                                  <p className="text-xs text-emerald-200/40">No evidence yet. Add the first note below.</p>
                                )}

                                {r.observations.map((o) => (
                                  <div key={o.key} className="bg-white/5 border border-white/10 rounded-xl p-4">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className={`px-2 py-0.5 text-[10px] rounded-full border ${outcomeBadge(o.outcome)}`}>{o.outcome}</span>
                                        {o.area && <span className="px-2 py-0.5 text-[10px] rounded-full bg-white/10 text-white/70">{o.area}</span>}
                                      </div>
                                      <button onClick={() => handleDeleteObservation(r.id, o.key)} className="text-xs text-red-400/70 hover:text-red-300 transition-colors shrink-0">Delete</button>
                                    </div>
                                    <p className="text-sm text-white/85 mt-2 break-words whitespace-pre-wrap">{o.context}</p>
                                    {o.pictures?.length > 0 && (
                                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-3">
                                        {o.pictures.map((u) => (
                                          <a key={u} href={u} target="_blank" rel="noreferrer" className="block aspect-video rounded-lg overflow-hidden border border-white/10 hover:border-emerald-400/50 transition-colors">
                                            <img src={u} alt="evidence" className="w-full h-full object-cover" />
                                          </a>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}

                                <div className="bg-white/5 border border-emerald-500/20 rounded-xl p-4">
                                  <p className="text-sm font-medium text-white mb-3">Add evidence</p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                                    <input type="text" value={oArea} onChange={(e) => setOArea(e.target.value)} placeholder="Area / room / department" className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                                    <select value={oOutcome} onChange={(e) => setOOutcome(e.target.value)} className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 [color-scheme:dark]">
                                      {OUTCOMES.map((o) => <option key={o} value={o} className="bg-slate-800">{o}</option>)}
                                    </select>
                                  </div>
                                  <textarea value={oContext} onChange={(e) => setOContext(e.target.value)} rows={3} placeholder="Write the context of this evidence..." className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none mb-3" />

                                  <label className="block cursor-pointer">
                                    <div className="px-4 py-2.5 bg-white/5 border border-dashed border-white/15 rounded-lg text-sm text-emerald-200/70 hover:border-emerald-400/50 hover:text-emerald-200 transition-colors text-center">
                                      {oUploading ? "Uploading to Google Drive..." : "Upload picture evidence (goes to Google Drive)"}
                                    </div>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      multiple
                                      className="hidden"
                                      onChange={(e) => { handleUploadPictures(e.target.files); e.target.value = ""; }}
                                    />
                                  </label>

                                  {oPictures.length > 0 && (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                                      {oPictures.map((u) => (
                                        <div key={u} className="relative group">
                                          <a href={u} target="_blank" rel="noreferrer" className="block aspect-video rounded-lg overflow-hidden border border-white/10">
                                            <img src={u} alt="evidence" className="w-full h-full object-cover" />
                                          </a>
                                          <button onClick={() => handleRemovePicture(u)} className="absolute top-1 right-1 px-1.5 py-0.5 text-[10px] rounded bg-black/70 text-red-300 opacity-0 group-hover:opacity-100 transition-opacity">Remove</button>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  <button onClick={() => handleAddObservation(r.id)} disabled={oSaving} className="mt-3 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 text-white text-sm font-medium rounded-lg transition-colors">
                                    {oSaving ? "Saving..." : "Save Evidence"}
                                  </button>
                                </div>

                                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                  <p className="text-sm font-medium text-white mb-1">Approval signature</p>
                                  <p className="text-xs text-emerald-200/50 mb-3">
                                    Used on the PDF report for this visit. Leave empty to use your saved default signature.
                                  </p>
                                  <div className="flex flex-wrap items-center gap-3">
                                    <div className="bg-white px-3 py-2 rounded-lg border border-white/10 min-h-[56px] flex items-center">
                                      <img src={r.signature || SIG_DEFAULT} alt="Signature" className="h-11 object-contain" />
                                    </div>
                                    <label className="px-3 py-2 text-xs rounded-lg bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-600/50 transition-colors cursor-pointer">
                                      {sigBusyId === r.id ? "Uploading..." : r.signature ? "Replace" : "Upload"}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                          handleSignatureUpload(r.id, e.target.files?.[0] || null);
                                          e.target.value = "";
                                        }}
                                      />
                                    </label>
                                    {r.signature && (
                                      <button onClick={() => handleClearSignature(r.id)} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                                        Reset to default
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
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
