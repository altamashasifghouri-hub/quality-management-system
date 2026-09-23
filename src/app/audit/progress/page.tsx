"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { loadPdfImage } from "@/lib/pdf-image";

interface Finding {
  department?: string;
  clause?: string;
  type?: string;
  detail: string;
  evidence?: string[];
  resolved?: boolean;
  resolved_at?: string | null;
}

interface Plan {
  id: string;
  title: string;
  branch_id: string | null;
  branch_name: string;
  date_of_plan: string | null;
  created_at: string | null;
  findings: Finding[];
  source: string;
}

interface Issue {
  planId: string;
  planTitle: string;
  branchName: string;
  auditDate: string | null;
  source: string;
  finding: Finding;
}

const TYPE_COLOR: Record<string, string> = {
  Critical: "bg-red-500/20 border-red-500/40 text-red-300",
  High: "bg-orange-500/20 border-orange-500/40 text-orange-300",
  Medium: "bg-amber-500/20 border-amber-500/40 text-amber-300",
  Low: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300",
};

const SIG_DEFAULT = "/signature.png";

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

function fmt12h(iso?: string | null): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "—";
  const date = `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
  const time = dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
  return `${date}, ${time}`;
}

export default function ProgressPage() {
  const supabase = createClient();
  const [groups, setGroups] = useState<{ name: string; plans: Plan[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeBranch, setActiveBranch] = useState<string | null>(null);
  const [preparedBy, setPreparedBy] = useState("Administrator");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: b }, { data: isoPlans }, { data: schedData }] = await Promise.all([
      supabase.from("internal_audits").select("*").order("created_at", { ascending: false }),
      supabase.from("branches").select("*"),
      supabase.from("audit_plans").select("*").order("created_at", { ascending: false }),
      supabase.from("audit_schedules").select("*"),
    ]);
    const branchName = new Map<string, string>((b || []).map((r: any) => [r.id, r.name]));
    const isoBranch = new Map<string, string>((schedData || []).map((sc: any) => [sc.id, branchName.get(sc.branch_id) || ""]));
    const isoDate = new Map<string, string | null>((schedData || []).map((sc: any) => [sc.id, sc.date_to || null]));
    const intPlans: Plan[] = (p || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      branch_id: r.branch_id,
      branch_name: branchName.get(r.branch_id) || "Unassigned",
      date_of_plan: r.date_of_plan,
      created_at: r.created_at,
      findings: r.findings || [],
      source: "internal",
    }));
    const isoArr: Plan[] = (isoPlans || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      branch_id: r.branch_id,
      branch_name: isoBranch.get(r.schedule_id) || "Unassigned",
      date_of_plan: r.date_of_plan || isoDate.get(r.schedule_id) || null,
      created_at: r.created_at,
      findings: r.findings || [],
      source: "iso",
    }));
    const all = [...intPlans, ...isoArr].sort((a, z) => (z.created_at || "").localeCompare(a.created_at || ""));
    const groupMap = new Map<string, Plan[]>();
    all.forEach((pl) => {
      const list = groupMap.get(pl.branch_name) || [];
      list.push(pl);
      groupMap.set(pl.branch_name, list);
    });
    const grouped: { name: string; plans: Plan[] }[] = [];
    groupMap.forEach((list, name) => grouped.push({ name, plans: list }));
    grouped.sort((a, z) => a.name.localeCompare(z.name));
    setGroups(grouped);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.user_metadata?.full_name) setPreparedBy(data.user.user_metadata.full_name);
    });
  }, [supabase]);

  const selected = activeBranch ? groups.filter((g) => g.name === activeBranch) : groups;
  function collectIssues(gs: { name: string; plans: Plan[] }[]): Issue[] {
    const list = gs.flatMap((g) =>
      g.plans.flatMap((pl) =>
        pl.findings.map((f): Issue => ({
          planId: pl.id,
          planTitle: pl.title,
          branchName: g.name,
          auditDate: pl.date_of_plan || pl.created_at,
          source: pl.source,
          finding: f,
        }))
      )
    );
    list.sort((a, z) => {
      const ar = a.finding.resolved === true ? 1 : 0;
      const zr = z.finding.resolved === true ? 1 : 0;
      if (ar !== zr) return ar - zr;
      return (z.finding.resolved_at || "").localeCompare(a.finding.resolved_at || "");
    });
    return list;
  }
  const issues = collectIssues(selected);

  const totals = groups.reduce(
    (acc, g) => {
      const n = g.plans.reduce((sum, pl) => sum + pl.findings.length, 0);
      const r = g.plans.reduce((sum, pl) => sum + pl.findings.filter((f) => f.resolved === true).length, 0);
      return { total: acc.total + n, resolved: acc.resolved + r };
    },
    { total: 0, resolved: 0 }
  );
  const unresolved = totals.total - totals.resolved;
  const pct = totals.total ? Math.round((totals.resolved / totals.total) * 100) : 0;
  const isoCount = groups.reduce((s, g) => s + g.plans.reduce((s2, pl) => s2 + (pl.source === "iso" ? pl.findings.length : 0), 0), 0);
  const internalCount = totals.total - isoCount;

  async function downloadPdf() {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 18;
    const LOGO = "/logo.jpg";

    try {
      const logoUrl = await loadPdfImage(LOGO);
      const logoW = 48;
      const logoH = 34;
      doc.addImage(logoUrl, "JPEG", (pageWidth - logoW) / 2, margin - 16, logoW, logoH);
    } catch { /* logo unavailable */ }

    const now = new Date();
    const docNo = `QMS/PR/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    doc.setFontSize(17);
    doc.setTextColor(15, 23, 42);
    doc.text("ISSUES PROGRESS REPORT", pageWidth / 2, margin + 28, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Document No: ${docNo}`, pageWidth / 2, margin + 34, { align: "center" });
    doc.text(`Generated: ${now.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`, pageWidth / 2, margin + 40, { align: "center" });

    autoTable(doc, {
      startY: margin + 46,
      theme: "grid",
      head: [["Metric", "Value"]],
      body: [
        ["Total issues", String(totals.total)],
        ["ISO 9001 issues", String(isoCount)],
        ["Internal audit issues", String(internalCount)],
        ["Resolved", String(totals.resolved)],
        ["Unresolved", String(unresolved)],
        ["Resolved %", `${pct}%`],
      ],
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [29, 78, 216], textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 } },
    });
    let y = (doc as any).lastAutoTable.finalY + 10;

    doc.setFontSize(12);
    doc.setTextColor(29, 78, 216);
    doc.text("Branch breakdown", margin, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      head: [["Branch", "Issues", "Resolved", "Unresolved", "Resolved %"]],
      body: groups.map((g) => {
        const n = g.plans.reduce((s, pl) => s + pl.findings.length, 0);
        const r = g.plans.reduce((s, pl) => s + pl.findings.filter((f) => f.resolved === true).length, 0);
        const p = n ? Math.round((r / n) * 100) : 0;
        return [g.name, String(n), String(r), String(n - r), `${p}%`];
      }),
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [29, 78, 216], textColor: 255, fontStyle: "bold" },
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    const allIssues = collectIssues(groups);
    doc.setFontSize(12);
    doc.setTextColor(29, 78, 216);
    doc.text("Issues", margin, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      theme: "grid",
      head: [["#", "Issue", "Audit", "Branch", "Department", "Type", "Audit date", "Resolved date & time", "Status"]],
      body: allIssues.map((it, i) => [
        String(i + 1),
        it.finding.detail,
        it.source === "iso" ? "ISO 9001" : "Internal",
        it.branchName,
        it.finding.department || "—",
        it.finding.type || "Medium",
        fmtDate(it.auditDate),
        it.finding.resolved === true ? fmt12h(it.finding.resolved_at) : "—",
        it.finding.resolved === true ? "Resolved" : "Unresolved",
      ]),
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [29, 78, 216], textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 62 }, 2: { cellWidth: 17 }, 3: { cellWidth: 18 }, 4: { cellWidth: 20 }, 5: { cellWidth: 17 }, 6: { cellWidth: 18 }, 7: { cellWidth: 26 }, 8: { cellWidth: 16 } },
    });

    let y2 = (doc as any).lastAutoTable.finalY + 14;
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y2 > pageHeight - 40) { doc.addPage(); y2 = 18; }
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text(`Prepared by: ${preparedBy}`, 18, y2);
    doc.text(`Date: ${new Date().toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`, pageWidth - 18, y2, { align: "right" });
    y2 += 14;
    doc.text("Signature:", 18, y2);
    try {
      const dataUrl = await loadPdfImage(SIG_DEFAULT);
      doc.addImage(dataUrl, "JPEG", 40, y2 - 8, 45, 22);
    } catch { /* signature image unavailable */ }

    doc.save("QMS_Issues_Progress_Report.pdf");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back to Dashboard
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Progress</h1>
            <p className="text-blue-200/60">Resolved vs unresolved issues across branches</p>
          </div>
          <button
            onClick={downloadPdf}
            disabled={loading || totals.total === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download Progress PDF
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-blue-600/15 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-blue-400/25 rounded-xl p-5">
                <p className="text-xs text-blue-200/50 uppercase tracking-wide">Total issues</p>
                <p className="text-3xl font-bold text-white mt-1">{totals.total}</p>
              </div>
              <div className="bg-gradient-to-br from-sky-600/15 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-sky-400/30 rounded-xl p-5">
                <p className="text-xs text-sky-300/60 uppercase tracking-wide">ISO 9001 issues</p>
                <p className="text-3xl font-bold text-sky-300 mt-1">{isoCount}</p>
              </div>
              <div className="bg-gradient-to-br from-purple-600/15 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-purple-400/30 rounded-xl p-5">
                <p className="text-xs text-purple-300/60 uppercase tracking-wide">Internal audit issues</p>
                <p className="text-3xl font-bold text-purple-300 mt-1">{internalCount}</p>
              </div>
              <div className="bg-gradient-to-br from-emerald-600/15 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-emerald-400/30 rounded-xl p-5">
                <p className="text-xs text-emerald-300/60 uppercase tracking-wide">Resolved</p>
                <p className="text-3xl font-bold text-emerald-300 mt-1">{totals.resolved}</p>
              </div>
              <div className="bg-gradient-to-br from-amber-600/15 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-amber-400/30 rounded-xl p-5">
                <p className="text-xs text-amber-300/60 uppercase tracking-wide">Unresolved</p>
                <p className="text-3xl font-bold text-amber-300 mt-1">{unresolved}</p>
              </div>
              <div className="bg-gradient-to-br from-indigo-600/15 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-indigo-400/30 rounded-xl p-5">
                <p className="text-xs text-indigo-300/60 uppercase tracking-wide">Resolved</p>
                <p className="text-3xl font-bold text-indigo-300 mt-1">{pct}%</p>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">Branch overview</h2>
              </div>
              <div className="p-6 space-y-4">
                {groups.map((g) => {
                  const n = g.plans.reduce((s, pl) => s + pl.findings.length, 0);
                  const r = g.plans.reduce((s, pl) => s + pl.findings.filter((f) => f.resolved === true).length, 0);
                  const u = n - r;
                  const width = n ? Math.round((r / n) * 100) : 0;
                  return (
                    <button
                      key={g.name}
                      onClick={() => setActiveBranch(activeBranch === g.name ? null : g.name)}
                      className={`w-full text-left border rounded-xl px-4 py-3 transition-colors ${activeBranch === g.name ? "border-blue-500/50 bg-white/[0.04]" : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <span className="text-white font-medium">{g.name}</span>
                        <span className="text-xs text-blue-200/50">{n} issues · {r} resolved · {u} unresolved · <span className="text-emerald-300 font-semibold">{width}% resolved</span></span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-2.5 flex-1 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500/80 transition-all" style={{ width: `${width}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-emerald-300 w-10 text-right">{width}%</span>
                      </div>
                    </button>
                  );
                })}
                {groups.length === 0 && <p className="text-sm text-blue-200/40">No audit plans with findings yet.</p>}
              </div>
            </div>

            <div>
              <div className="flex flex-wrap gap-2 mb-6">
                <button
                  onClick={() => setActiveBranch(null)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${activeBranch === null ? "bg-white/10 border-white/30 text-white" : "bg-white/5 border-white/10 text-blue-200/60 hover:bg-white/10"}`}
                >
                  All Branches
                </button>
                {groups.map((g) => {
                  const n = g.plans.reduce((s, pl) => s + pl.findings.length, 0);
                  const r = g.plans.reduce((s, pl) => s + pl.findings.filter((f) => f.resolved === true).length, 0);
                  const p = n ? Math.round((r / n) * 100) : 0;
                  return (
                    <button
                      key={g.name}
                      onClick={() => setActiveBranch(g.name)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${activeBranch === g.name ? "bg-blue-600/30 border-blue-500/40 text-blue-200" : "bg-white/5 border-white/10 text-blue-200/60 hover:bg-white/10"}`}
                    >
                      {g.name} · {p}%
                    </button>
                  );
                })}
              </div>

              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/10">
                  <h2 className="text-lg font-semibold text-white">{activeBranch ? `${activeBranch} issues` : "All issues"}</h2>
                  <p className="text-xs text-blue-200/40 mt-1">Unresolved issues shown first, then resolved by resolve date &amp; time.</p>
                </div>
                {issues.length === 0 ? (
                  <p className="text-blue-200/40 text-center py-16">No issues found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-xs uppercase tracking-wide text-blue-200/50 border-b border-white/10">
                          <th className="px-6 py-3 font-medium">#</th>
                          <th className="px-6 py-3 font-medium">Issue</th>
                          <th className="px-6 py-3 font-medium">Audit</th>
                          <th className="px-6 py-3 font-medium">Audit date</th>
                          <th className="px-6 py-3 font-medium">Resolve date &amp; time</th>
                          <th className="px-6 py-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {issues.map((it, i) => {
                          const f = it.finding;
                          const ty = f.type || "Medium";
                          return (
                            <tr key={`${it.planId}-${i}`} className="hover:bg-white/[0.03] align-top">
                              <td className="px-6 py-3 text-white/50">{i + 1}</td>
                              <td className="px-6 py-3 max-w-md">
                                <div className="text-white line-clamp-2">{f.detail || "—"}</div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                  <span className={`px-2 py-0.5 text-[10px] rounded-full border ${TYPE_COLOR[ty] || TYPE_COLOR.Medium}`}>{ty}</span>
                                  {f.department && <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-200">{f.department}</span>}
                                  {f.clause && <span className="px-2 py-0.5 text-[10px] rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200">Clause {f.clause}</span>}
                                </div>
                              </td>
                              <td className="px-6 py-3 whitespace-nowrap">
                                <span className={`px-2 py-0.5 text-[10px] rounded-full border ${it.source === "iso" ? "bg-sky-500/20 border-sky-500/40 text-sky-300" : "bg-purple-500/20 border-purple-500/40 text-purple-300"}`}>
                                  {it.source === "iso" ? "ISO 9001" : "Internal"}
                                </span>
                              </td>
                              <td className="px-6 py-3 text-white/80 whitespace-nowrap">{fmtDate(it.auditDate)}</td>
                              <td className="px-6 py-3 text-white/80 whitespace-nowrap">{f.resolved === true ? fmt12h(f.resolved_at) : "—"}</td>
                              <td className="px-6 py-3 whitespace-nowrap">
                                {f.resolved === true ? (
                                  <span className="px-2.5 py-1 text-xs rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">Resolved</span>
                                ) : (
                                  <span className="px-2.5 py-1 text-xs rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300">Unresolved</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}