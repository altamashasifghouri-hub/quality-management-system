"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

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
  auditDate: string | null;
  finding: Finding;
}

const TYPE_COLOR: Record<string, string> = {
  Critical: "bg-red-500/20 border-red-500/40 text-red-300",
  High: "bg-orange-500/20 border-orange-500/40 text-orange-300",
  Medium: "bg-amber-500/20 border-amber-500/40 text-amber-300",
  Low: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300",
};

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

  const selected = activeBranch ? groups.filter((g) => g.name === activeBranch) : groups;
  const issues: Issue[] = selected.flatMap((g) =>
    g.plans.flatMap((pl) =>
      pl.findings.map((f): Issue => ({ planId: pl.id, planTitle: pl.title, auditDate: pl.date_of_plan || pl.created_at, finding: f }))
    )
  );
  issues.sort((a, z) => {
    const ar = a.finding.resolved === true ? 1 : 0;
    const zr = z.finding.resolved === true ? 1 : 0;
    if (ar !== zr) return ar - zr;
    return (z.finding.resolved_at || "").localeCompare(a.finding.resolved_at || "");
  });

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

        <h1 className="text-3xl font-bold text-white mb-2">Progress</h1>
        <p className="text-blue-200/60 mb-10">Resolved vs unresolved issues across branches</p>

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-600/15 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-blue-400/25 rounded-xl p-5">
                <p className="text-xs text-blue-200/50 uppercase tracking-wide">Total issues</p>
                <p className="text-3xl font-bold text-white mt-1">{totals.total}</p>
              </div>
              <div className="bg-gradient-to-br from-emerald-600/15 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-emerald-400/30 rounded-xl p-5">
                <p className="text-xs text-emerald-300/60 uppercase tracking-wide">Resolved</p>
                <p className="text-3xl font-bold text-emerald-300 mt-1">{totals.resolved}</p>
              </div>
              <div className="bg-gradient-to-br from-amber-600/15 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-amber-400/30 rounded-xl p-5">
                <p className="text-xs text-amber-300/60 uppercase tracking-wide">Unresolved</p>
                <p className="text-3xl font-bold text-amber-300 mt-1">{unresolved}</p>
              </div>
              <div className="bg-gradient-to-br from-purple-600/15 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-purple-400/30 rounded-xl p-5">
                <p className="text-xs text-purple-300/60 uppercase tracking-wide">Resolved</p>
                <p className="text-3xl font-bold text-purple-300 mt-1">{pct}%</p>
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
                        <span className="text-xs text-blue-200/50">{n} issues · {r} resolved · {u} unresolved</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500/80 transition-all" style={{ width: `${width}%` }} />
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
                  return (
                    <button
                      key={g.name}
                      onClick={() => setActiveBranch(g.name)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${activeBranch === g.name ? "bg-blue-600/30 border-blue-500/40 text-blue-200" : "bg-white/5 border-white/10 text-blue-200/60 hover:bg-white/10"}`}
                    >
                      {g.name} · {r}/{n}
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