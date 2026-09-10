"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import JSZip from "jszip";
import { loadPdfImage } from "@/lib/pdf-image";

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
  source: "internal" | "iso";
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

function jpegEncode(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas context"));
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = dataUrl;
  });
}

async function assetToDataUrl(url: string): Promise<string> {
  if (!url) return "";
  const cached = imageCache.get(url);
  if (cached) return cached;
  let dataUrl = "";
  try {
    if (url.startsWith("data:")) {
      dataUrl = url;
    } else {
      const proxy = url.startsWith("/") ? url : `/api/image-proxy?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxy);
      if (!res.ok) return "";
      const blob = await res.blob();
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("file read failed"));
        reader.readAsDataURL(blob);
      });
    }
    const jpeg = await jpegEncode(dataUrl);
    if (jpeg) imageCache.set(url, jpeg);
    return jpeg;
  } catch {
    return "";
  }
}

function embedImage(doc: jsPDF, dataUrl: string, x: number, y: number, w: number, h: number) {
  if (!dataUrl) return;
  try {
    doc.addImage(dataUrl, "JPEG", x, y, w, h);
  } catch {
    /* image embedding unavailable */
  }
}

function loadImageData(url: string): Promise<string> {
  return loadPdfImage(url);
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
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  const branchInitDone = useRef(false);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 4000); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 5000); }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: b }, { data: settingsData }, { data: isoPlans }, { data: schedData }] = await Promise.all([
      supabase.from("internal_audits").select("*").order("created_at", { ascending: false }),
      supabase.from("branches").select("*"),
      supabase.from("settings").select("*").limit(1).maybeSingle(),
      supabase.from("audit_plans").select("*").order("created_at", { ascending: false }),
      supabase.from("audit_schedules").select("*"),
    ]);
    const branchName = new Map<string, string>((b || []).map((r: any) => [r.id, r.name]));
    const schedBranch = new Map<string, string>((schedData || []).map((sc: any) => [sc.id, branchName.get(sc.branch_id) || ""]));
    const intPlans: CapaPlan[] = (p || []).map((r: any) => ({
      id: r.id, title: r.title, branch_id: r.branch_id, branch_name: branchName.get(r.branch_id) || "Unassigned",
      document_number: r.document_number, date_of_plan: r.date_of_plan, audit_period: r.audit_period,
      signature: r.signature, prepared_by: r.prepared_by, source: "internal", findings: r.findings || [],
    }));
    const isoSrc: CapaPlan[] = (isoPlans || []).map((r: any) => ({
      id: r.id, title: r.title, branch_id: r.branch_id, branch_name: schedBranch.get(r.schedule_id) || "Unassigned",
      document_number: r.document_number, date_of_plan: r.date_of_plan, audit_period: r.audit_period,
      signature: r.signature || null, prepared_by: r.prepared_by, source: "iso", findings: r.findings || [],
    }));
    setPlans([...intPlans, ...isoSrc]);
    if (settingsData) setSettings({ hr_name: settingsData.hr_name || "", ceo_name: settingsData.ceo_name || "" });
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!loading && plans.length > 0 && !branchInitDone.current) {
      branchInitDone.current = true;
      setExpandedBranches(new Set(plans.map((p) => p.branch_name)));
    }
  }, [loading, plans]);

  function toggleBranch(name: string) {
    setExpandedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function togglePlan(planId: string) {
    setExpandedPlans((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId); else next.add(planId);
      return next;
    });
  }

  function toggleBranchesAll(expand: boolean) {
    setExpandedBranches(expand ? new Set(plans.map((p) => p.branch_name)) : new Set());
  }

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
    const plan = plans.find((p) => p.id === planId);
    const table = plan?.source === "iso" ? "audit_plans" : "internal_audits";
    const { error: err } = await supabase.from(table).update({ findings, updated_at: new Date().toISOString() }).eq("id", planId);
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

  async function renderCapaReport(doc: jsPDF, plan: CapaPlan, finding: CapaFinding, ncr: string, userName: string, sigUrl: string) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - margin * 2;
    const maxY = pageHeight - 12;
    let y = margin;
    const ensure = (needed: number) => {
      if (y + needed > maxY) { doc.addPage(); y = margin; }
    };

    const logoData = await assetToDataUrl(LOGO);
    embedImage(doc, logoData, (pageWidth - 40) / 2, y, 40, 34);
    y += 46;
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
      ensure(above);
      doc.text(wrapped, margin, y);
      y += above;
      return y;
    };
    const sectionTitle = (t: string) => {
      ensure(40);
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
      ensure(wrapped.length * 4.5 + 4);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 4.5 + 2;
    };

    sectionTitle("1. Non-Conformance / Finding");
    (splitLines(finding.detail).length ? splitLines(finding.detail) : [finding.detail]).forEach(bullet);

    sectionTitle("2. Auditor's Observation (How Observed)");
    const obs = finding.observation ?? finding.detail;
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

    sectionTitle("6. Supporting Evidence");
    if (finding.evidence && finding.evidence.length > 0) {
      let col = 0;
      let rowY = y;
      for (const url of finding.evidence) {
        try {
          const dataUrl = await loadImageData(url);
          const w = 70;
          const h = 55;
          if (col % 2 === 0) {
            ensure(h + 8);
            rowY = y;
          }
          const x = margin + (col % 2) * (maxWidth / 2);
          doc.addImage(dataUrl, "PNG", x, rowY, w, h);
          if (/^https?:/i.test(url)) doc.link(x, rowY, w, h, { url });
          col += 1;
          if (col % 2 === 0) y = rowY + h + 8;
        } catch { /* image unavailable */ }
      }
      if (col % 2 !== 0) y = rowY + 55 + 8;
      y += 6;
    } else {
      bullet("No supporting evidence attached.");
    }

    sectionTitle("7. Approval");
    ensure(52);
    doc.setFontSize(10); doc.setTextColor(30, 41, 59);
    doc.text(`${userName}, Quality Assurance Executive`, margin, y + 14);
    const sigData = await assetToDataUrl(sigUrl);
    embedImage(doc, sigData, margin, y + 20, 52, 20);
    doc.setDrawColor(30, 41, 59);
    doc.line(margin, y + 44, margin + 55, y + 44);
    doc.setFontSize(8); doc.setTextColor(100, 116, 139);
    doc.text("Signature", margin + 7, y + 48);
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
      const { data: authData } = await supabase.auth.getUser();
      const userName = authData.user?.user_metadata?.full_name || settings.ceo_name || settings.hr_name || "Authorized Signatory";
      const sigUrl = plan.signature || SIG_DEFAULT;
      await renderCapaReport(doc, plan, finding, ncr, userName, sigUrl);

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

  async function handleGenerateAllPdf() {
    const tasks: { plan: CapaPlan; finding: CapaFinding; planId: string; idx: number }[] = [];
    plans.forEach((p) => p.findings.forEach((f, i) => { if (f.detail.trim()) tasks.push({ plan: p, finding: f, planId: p.id, idx: i }); }));
    if (tasks.length === 0) return showErr("No findings with descriptions to compile CAPA reports for.");
    if (generatingKey) return;
    setGeneratingKey("all");
    setError("");

    try {
      const existing = plans.flatMap((p) => p.findings).map((f) => f.ncr_number || "").filter(Boolean);
      const ncrByKey = new Map<string, string>();
      const doc = new jsPDF();
      const { data: authData } = await supabase.auth.getUser();
      const userName = authData.user?.user_metadata?.full_name || settings.ceo_name || settings.hr_name || "Authorized Signatory";
      let first = true;
      for (const t of tasks) {
        let ncr = t.finding.ncr_number;
        if (!ncr) {
          ncr = genNcrNumber(t.plan.branch_name, existing);
          existing.push(ncr);
        }
        ncrByKey.set(`${t.planId}::${t.idx}`, ncr);
        if (!first) doc.addPage();
        first = false;
        await renderCapaReport(doc, t.plan, t.finding, ncr, userName, t.plan.signature || SIG_DEFAULT);
      }

      const blob = doc.output("blob");
      const formData = new FormData();
      const today = new Date().toISOString().slice(0, 10);
      formData.append("file", blob, `CAPA_Reports_${today}.pdf`);
      formData.append("folderKind", "capa");
      const res = await fetch("/api/drive-upload", { method: "POST", body: formData });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson?.error === "not_connected") return showErr("Connect Google Drive first from the Storage page.");
        return showErr(errJson?.error?.message || "CAPA compilation upload failed.");
      }
      const json = await res.json();
      if (!json.url) return showErr("CAPA compilation upload failed.");

      const targetByKey = new Map(tasks.map((t) => [`${t.planId}::${t.idx}`, t]));
      for (const p of plans) {
        const updated: CapaFinding[] = [];
        let changed = false;
        p.findings.forEach((f, i) => {
          if (targetByKey.has(`${p.id}::${i}`)) {
            const next = {
              ...f,
              ncr_number: ncrByKey.get(`${p.id}::${i}`) || f.ncr_number,
              capa_pdf_url: json.url,
              capa_pdf_file_id: json.fileId || null,
            };
            if (next.ncr_number !== f.ncr_number || next.capa_pdf_url !== f.capa_pdf_url) changed = true;
            updated.push(next);
          } else {
            updated.push(f);
          }
        });
        if (changed) {
          const err = await persistFindings(p.id, updated);
          if (err) return showErr(err.message);
          setPlans((prev) => prev.map((x) => (x.id === p.id ? { ...x, findings: updated } : x)));
        }
      }
      showMsg(`Compiled ${tasks.length} CAPA report${tasks.length !== 1 ? "s" : ""} into one PDF and saved to Google Drive.`);
    } catch (e: any) {
      showErr(e?.message || "Could not compile CAPA reports.");
    } finally {
      setGeneratingKey(null);
    }
  }

  function toggleSelect(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function togglePlanSelection(planId: string) {
    setSelectedKeys((prev) => {
      const plan = plans.find((p) => p.id === planId);
      if (!plan) return prev;
      const keys = plan.findings.map((_, i) => `${plan.id}::${i}`);
      const allSelected = keys.length > 0 && keys.every((k) => prev.has(k));
      const next = new Set(prev);
      if (allSelected) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  }

  function handleSelectAll() {
    const openKeys = plans
      .filter((p) => expandedPlans.has(p.id) && expandedBranches.has(p.branch_name))
      .flatMap((p) => p.findings.map((_, i) => `${p.id}::${i}`));
    if (openKeys.length === 0) return showErr("Open at least one audit dropdown first, then select its CAPAs.");
    setSelectedKeys((prev) => {
      if (openKeys.every((k) => prev.has(k))) return new Set();
      return new Set(openKeys);
    });
  }

  async function handleDownloadZip() {
    const selected = plans.flatMap((p) => p.findings.map((f, i) => ({ plan: p, finding: f, planId: p.id, idx: i })))
      .filter((t) => selectedKeys.has(`${t.planId}::${t.idx}`));
    const withDetail = selected.filter((t) => t.finding.detail.trim());
    if (withDetail.length === 0) return showErr("Select at least one CAPA with a description.");
    if (generatingKey) return;
    setGeneratingKey("zip");
    setError("");

    try {
      const zip = new JSZip();
      const existing = plans.flatMap((p) => p.findings).map((f) => f.ncr_number || "").filter(Boolean);
      const ncrAssignments = new Map<string, { planId: string; idx: number; ncr: string }>();
      const { data: authData } = await supabase.auth.getUser();
      const userName = authData.user?.user_metadata?.full_name || settings.ceo_name || settings.hr_name || "Authorized Signatory";

      for (const t of withDetail) {
        let ncr = t.finding.ncr_number;
        if (!ncr) {
          ncr = genNcrNumber(t.plan.branch_name, existing);
          existing.push(ncr);
          ncrAssignments.set(`${t.planId}::${t.idx}`, { planId: t.planId, idx: t.idx, ncr });
        }
        const doc = new jsPDF();
        await renderCapaReport(doc, t.plan, t.finding, ncr, userName, t.plan.signature || SIG_DEFAULT);
        const blob = doc.output("blob");
        const ab = await blob.arrayBuffer();
        zip.file(`${sanitizeFile(t.plan.branch_name)}_CAPA_${sanitizeFile(ncr)}.pdf`, ab);
      }

      for (const [key, a] of ncrAssignments) {
        const pi = planIndex(a.planId);
        if (pi < 0) continue;
        const plan = plans[pi];
        const updated = plan.findings.map((f, i) => (i === a.idx ? { ...f, ncr_number: a.ncr } : f));
        const err = await persistFindings(a.planId, updated);
        if (err) return showErr(err.message);
        setPlans((prev) => prev.map((p) => (p.id === a.planId ? { ...p, findings: updated } : p)));
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(zipBlob);
      link.download = `CAPA_Reports_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      showMsg(`Downloaded ${withDetail.length} CAPA report${withDetail.length !== 1 ? "s" : ""} as a ZIP file.`);
    } catch (e: any) {
      showErr(e?.message || "Could not create ZIP download.");
    } finally {
      setGeneratingKey(null);
    }
  }

  async function handleDownloadCompiledPdf() {
    const selected = plans.flatMap((p) => p.findings.map((f, i) => ({ plan: p, finding: f, planId: p.id, idx: i })))
      .filter((t) => selectedKeys.has(`${t.planId}::${t.idx}`));
    const withDetail = selected.filter((t) => t.finding.detail.trim());
    if (withDetail.length === 0) return showErr("Select at least one CAPA with a description.");
    if (generatingKey) return;
    setGeneratingKey("compiled");
    setError("");

    try {
      const existing = plans.flatMap((p) => p.findings).map((f) => f.ncr_number || "").filter(Boolean);
      const ncrAssignments = new Map<string, { planId: string; idx: number; ncr: string }>();
      const { data: authData } = await supabase.auth.getUser();
      const userName = authData.user?.user_metadata?.full_name || settings.ceo_name || settings.hr_name || "Authorized Signatory";

      const doc = new jsPDF();
      let first = true;
      for (const t of withDetail) {
        let ncr = t.finding.ncr_number;
        if (!ncr) {
          ncr = genNcrNumber(t.plan.branch_name, existing);
          existing.push(ncr);
          ncrAssignments.set(`${t.planId}::${t.idx}`, { planId: t.planId, idx: t.idx, ncr });
        }
        if (!first) doc.addPage();
        first = false;
        await renderCapaReport(doc, t.plan, t.finding, ncr, userName, t.plan.signature || SIG_DEFAULT);
      }

      for (const [, a] of ncrAssignments) {
        const pi = planIndex(a.planId);
        if (pi < 0) continue;
        const plan = plans[pi];
        const updated = plan.findings.map((f, i) => (i === a.idx ? { ...f, ncr_number: a.ncr } : f));
        const err = await persistFindings(a.planId, updated);
        if (err) return showErr(err.message);
        setPlans((prev) => prev.map((p) => (p.id === a.planId ? { ...p, findings: updated } : p)));
      }

      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Compiled_CAPA_Reports_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showMsg(`Downloaded ${withDetail.length} compiled CAPA report${withDetail.length !== 1 ? "s" : ""} as one PDF.`);
    } catch (e: any) {
      showErr(e?.message || "Could not compile CAPA PDF download.");
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
  const openKeys = plans
    .filter((p) => expandedPlans.has(p.id) && expandedBranches.has(p.branch_name))
    .flatMap((p) => p.findings.map((_, i) => `${p.id}::${i}`));
  const allSelected = openKeys.length > 0 && openKeys.every((k) => selectedKeys.has(k));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900/90 via-blue-900/65 to-slate-900/95">
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

        {!loading && plans.length > 0 && (
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <button onClick={handleGenerateAllPdf} disabled={!!generatingKey} className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-semibold transition-colors disabled:opacity-50">
              {generatingKey === "all" ? "Compiling all CAPA reports..." : "Generate All CAPA Reports (one PDF)"}
            </button>
            <button onClick={handleSelectAll} disabled={!!generatingKey} className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {allSelected ? "Clear Selection" : "Select Opened CAPAs"}
            </button>
            <button onClick={handleDownloadZip} disabled={selectedKeys.size === 0 || !!generatingKey} className="px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-semibold transition-colors disabled:opacity-50">
              {generatingKey === "zip" ? "Preparing ZIP..." : `Download Selected (${selectedKeys.size}) as ZIP`}
            </button>
            <button onClick={handleDownloadCompiledPdf} disabled={selectedKeys.size === 0 || !!generatingKey} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors disabled:opacity-50">
              {generatingKey === "compiled" ? "Compiling PDF..." : "Download Compiled PDF"}
            </button>
            <button onClick={() => toggleBranchesAll(expandedBranches.size < branchGroups.length)} className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors">
              {expandedBranches.size < branchGroups.length ? "Expand All Branches" : "Collapse All Branches"}
            </button>
            <span className="text-xs text-blue-200/40">Tick the checkboxes on the CAPAs you want, then download them as one PDF or as a ZIP.</span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : plans.length === 0 ? (
          <p className="text-blue-200/40 text-center py-16">No findings yet. Record an audit (Internal or ISO 9001), generate findings, and they will appear here grouped under their standard.</p>
        ) : (
          <div className="space-y-8">
            {branchGroups.map((group) => {
              const totalFindings = group.plans.reduce((n, p) => n + p.findings.length, 0);
              const branchOpen = expandedBranches.has(group.name);
              return (
                <div key={group.name}>
                  <button onClick={() => toggleBranch(group.name)} className="w-full flex items-center gap-2 text-lg font-semibold text-white mb-3 hover:text-amber-300 transition-colors">
                    <svg className={`w-5 h-5 text-amber-400 transition-transform ${branchOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                    {group.name}
                    <span className="text-xs text-blue-200/40">· {totalFindings} finding{totalFindings !== 1 ? "s" : ""}</span>
                    <span className="text-xs text-amber-300/60">{branchOpen ? "· (collapse)" : "· (open)"}</span>
                  </button>
                  {branchOpen && (
                    <div className="space-y-6">
                      {group.plans.map((plan) => {
                        if (plan.findings.length === 0) return null;
                        const planOpen = expandedPlans.has(plan.id);
                        const planKeys = plan.findings.map((_, i) => `${plan.id}::${i}`);
                        const planSelectedCount = planKeys.filter((k) => selectedKeys.has(k)).length;
                        const planAllSelected = planSelectedCount === planKeys.length;
                        return (
                          <div key={plan.id} className="space-y-4">
                            <button onClick={() => togglePlan(plan.id)} className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-2 hover:border-amber-400/40 transition-colors">
                              <div className="flex items-center gap-2 flex-wrap">
                                <svg className={`w-4 h-4 text-purple-300 transition-transform ${planOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                                <span className="text-white font-medium flex items-center gap-2 flex-wrap">
                                  {plan.title}
                                  <span className={`px-2 py-0.5 text-[10px] rounded-full ${plan.source === "iso" ? "bg-blue-500/20 border border-blue-500/30 text-blue-200" : "bg-purple-500/20 border border-purple-500/30 text-purple-200"}`}>
                                    {plan.source === "iso" ? "ISO 9001" : "Internal"}
                                  </span>
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-200/40">{[plan.document_number, plan.date_of_plan, plan.audit_period].filter(Boolean).join(" · ")}</span>
                                <span className="text-xs text-purple-300 bg-purple-500/20 px-2 py-1 rounded-full border border-purple-500/30">{plan.findings.length} finding{plan.findings.length !== 1 ? "s" : ""}</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); togglePlanSelection(plan.id); }}
                                  title={planAllSelected ? `Deselect all CAPAs of this audit` : `Select all ${planKeys.length} CAPAs of this audit`}
                                  className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${planSelectedCount > 0 ? "bg-amber-500/90 hover:bg-amber-400 border-amber-500/40 text-slate-900" : "bg-white/5 hover:bg-white/10 border-white/15 text-neutral-300"}`}
                                >
                                  {planAllSelected ? "Clear" : planSelectedCount > 0 ? `Marked ${planSelectedCount}/${planKeys.length}` : "Mark All"}
                                </button>
                              </div>
                            </button>

                            {planOpen && (
                              <div className="pl-3 sm:pl-5 border-l border-amber-400/20 space-y-4">
                                {plan.findings.map((f, idx) => {
                                  const key = `${plan.id}::${idx}`;
                                  const busy = savingKey === key;
                                  const genBusy = generatingKey === key;
                                  return (
                                    <div key={`${plan.id}-${idx}`} className={`bg-white/5 backdrop-blur-sm border rounded-2xl p-5 ${f.capa_pdf_url ? "border-green-500/30" : "border-white/10"}`}>
                                      <div className="flex flex-wrap items-center gap-2 mb-4">
                                        <label className="flex items-center cursor-pointer" title="Select to include in ZIP download">
                                          <input type="checkbox" checked={selectedKeys.has(key)} onChange={() => toggleSelect(key)} className="w-4 h-4 accent-amber-500 cursor-pointer" />
                                        </label>
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
                                          <textarea rows={2} value={f.observation ?? ""} onChange={(e) => patchFinding(plan.id, idx, { observation: e.target.value })} className={inputCls} />
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

                                      {f.evidence && f.evidence.length > 0 && (
                                        <div className="mt-4">
                                          <span className="block text-xs text-blue-200/60 mb-2">Supporting Evidence — click a picture to open it in a new tab</span>
                                          <div className="flex flex-wrap gap-3">
                                            {f.evidence.map((ev, ei) => {
                                              const imgSrc = ev.startsWith("data:") ? ev : `/api/image-proxy?url=${encodeURIComponent(ev)}`;
                                              return (
                                                <a key={ei} href={imgSrc} target="_blank" rel="noopener noreferrer" title="Open picture in new tab"
                                                  className="group relative block w-28 h-24 rounded-lg overflow-hidden border border-white/10 hover:border-amber-400/70 transition-colors">
                                                  <img src={imgSrc} alt={`Evidence ${ei + 1}`} className="w-full h-full object-cover" />
                                                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                    <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                                                  </span>
                                                </a>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}

                                      <div className="mt-4 flex flex-wrap items-center gap-3">
                                        <button onClick={() => handleSave(plan.id, idx)} disabled={busy} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                                          {busy ? "Saving..." : "Save Actions"}
                                        </button>
                                        {!f.capa_pdf_url && (
                                          <button onClick={() => handleGeneratePdf(plan.id, idx)} disabled={genBusy || !!generatingKey} className="px-4 py-2 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-slate-900 text-sm font-semibold transition-colors disabled:opacity-50">
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
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}