"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

interface Finding { department: string; type: string; detail: string; recommendation?: string; evidence?: string[]; resolved?: boolean; }
interface BranchStat {
  id: string;
  name: string;
  audits: number;
  findings: number;
  resolved: number;
  unresolved: number;
  pct: number | null;
}

function todayLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function BestBranch() {
  const supabase = createClient();
  const [stats, setStats] = useState<BranchStat[]>([]);
  const [from, setFrom] = useState(`${new Date().getFullYear()}-01-01`);
  const [to, setTo] = useState(todayLocalISO());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    const [{ data: b }, { data: p }] = await Promise.all([
      supabase.from("branches").select("id, name").order("created_at", { ascending: true }),
      supabase.from("internal_audits").select("branch_id, created_at, findings"),
    ]);
    const branchDefs = (b || []) as { id: string; name: string }[];
    const byBranch = new Map<string, BranchStat>();
    branchDefs.forEach((br) => byBranch.set(br.id, { id: br.id, name: br.name, audits: 0, findings: 0, resolved: 0, unresolved: 0, pct: null }));

    (p || []).forEach((plan: any) => {
      const created = (plan.created_at || "").toString().slice(0, 10);
      if (!created || created < from || created > to) return;
      const findings: Finding[] = plan.findings || [];
      if (!findings.length) return;
      const stat = byBranch.get(plan.branch_id);
      if (!stat) return;
      stat.audits += 1;
      const resolved = findings.filter((f) => f.resolved === true).length;
      stat.findings += findings.length;
      stat.resolved += resolved;
      stat.unresolved += findings.length - resolved;
      stat.pct = Math.round((stat.resolved / stat.findings) * 100);
    });

    const ranked = Array.from(byBranch.values())
      .sort((a, z) => {
        if (a.pct === null && z.pct === null) return a.name.localeCompare(z.name);
        if (a.pct === null) return 1;
        if (z.pct === null) return -1;
        if (z.pct !== a.pct) return z.pct - a.pct;
        if (z.resolved !== a.resolved) return z.resolved - a.resolved;
        return a.name.localeCompare(z.name);
      });

    setStats(ranked);
    setLoading(false);
    setLoaded(true);
  }, [supabase, from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const best = stats.find((s) => s.pct !== null) || null;

  const inputCls = "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 [color-scheme:dark]";
  const labelCls = "block text-sm text-blue-200/60 mb-1";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/audit" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to Audit Management
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">Best Branch</h1>
        <p className="text-blue-200/60 mb-8">Branches ranked by % of non-conformities resolved in the selected period</p>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>From</label>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls + " w-full"} />
            </div>
            <div>
              <label className={labelCls}>To</label>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputCls + " w-full"} />
            </div>
            <div className="flex items-end">
              <button onClick={fetchData} disabled={loading} className="w-full px-4 py-2 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-slate-900 text-sm font-semibold transition-colors disabled:opacity-50">
                {loading ? "Calculating..." : "Update Ranking"}
              </button>
            </div>
          </div>
        </div>

        {!loaded ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : !from || !to || from > to ? (
          <p className="text-amber-300/80 text-center py-16">Pick a valid date range to see the ranking.</p>
        ) : best ? (
          <div className="bg-gradient-to-r from-amber-500/15 to-yellow-500/5 border border-amber-500/30 rounded-2xl p-6 mb-8 flex items-center gap-5">
            <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
              <svg className="w-7 h-7 text-amber-400" fill="currentColor" viewBox="0 0 24 24"><path d="M5.5 3.636h13v3.182H5.5zM6.682 8.5h10.636a1.5 1.5 0 0 1 1.1.476l2.455 2.636a1.5 1.5 0 0 1 .383 1.01v1.842A4.65 4.65 0 0 1 16.654 18.9a5.16 5.16 0 0 1-3.9 1.6H11.5a5.16 5.16 0 0 1-3.9-1.6 4.65 4.65 0 0 1-4.592-4.436V9.986a1.5 1.5 0 0 1 .383-1.01l2.455-2.636a1.5 1.5 0 0 1 1.1-.476M4.636 10.8v3.48a3.05 3.05 0 0 0 3.045 3.05 3.57 3.57 0 0 0 2.7-1.1 3.57 3.57 0 0 0 2.7 1.1 3.05 3.05 0 0 0 3.045-3.05V10.8a1.5 1.5 0 0 0-1.5-1.5H6.136a1.5 1.5 0 0 0-1.5 1.5" /></svg>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-amber-200/60">Best branch in this period</p>
              <h2 className="text-2xl font-bold text-white">{best.name}</h2>
              <p className="text-sm text-blue-200/60 mt-1">{best.resolved} of {best.findings} non-conformities resolved ({best.pct}%)</p>
            </div>
          </div>
        ) : (
          <p className="text-blue-200/40 text-center py-16">No audits with findings in this period.</p>
        )}

        {loaded && stats.length > 0 && (
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10">
              <h2 className="text-lg font-semibold text-white">Branch Ranking</h2>
              <p className="text-xs text-blue-200/40 mt-1">Based on the audits recorded in the selected period and the findings marked resolved</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/10 text-left text-xs text-blue-200/60">
                  <th className="px-6 py-3 font-medium w-16">#</th>
                  <th className="px-6 py-3 font-medium">Branch</th>
                  <th className="px-6 py-3 font-medium text-center">Audits</th>
                  <th className="px-6 py-3 font-medium text-center">Findings</th>
                  <th className="px-6 py-3 font-medium text-center">Resolved</th>
                  <th className="px-6 py-3 font-medium text-center">Unresolved</th>
                  <th className="px-6 py-3 font-medium">Resolved %</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s, i) => {
                  const hasFindings = s.pct !== null;
                  return (
                    <tr key={s.id} className={`border-t border-white/5 ${i === 0 && hasFindings ? "bg-amber-500/5" : ""}`}>
                      <td className="px-6 py-3">
                        {hasFindings ? (
                          <span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-bold ${i === 0 ? "bg-amber-500/30 text-amber-200" : i === 1 ? "bg-slate-400/20 text-slate-300" : i === 2 ? "bg-orange-500/20 text-orange-300" : "bg-white/10 text-white/60"}`}>
                            {i + 1}
                          </span>
                        ) : (
                          <span className="text-blue-200/30">—</span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{s.name}</span>
                          {i === 0 && hasFindings && (
                            <span className="px-2 py-0.5 text-[10px] uppercase tracking-wide rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-200">Best</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-center text-white/60">{s.audits}</td>
                      <td className="px-6 py-3 text-center text-white/60">{s.findings}</td>
                      <td className="px-6 py-3 text-center text-green-300">{hasFindings ? s.resolved : "—"}</td>
                      <td className="px-6 py-3 text-center text-red-300/80">{hasFindings ? s.unresolved : "—"}</td>
                      <td className="px-6 py-3">
                        {hasFindings ? (
                          <div className="flex items-center gap-3">
                            <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${s.pct === 100 ? "bg-gradient-to-r from-green-500 to-emerald-400" : "bg-gradient-to-r from-amber-500 to-yellow-400"}`} style={{ width: `${s.pct}%` }} />
                            </div>
                            <span className="text-white font-semibold whitespace-nowrap">{s.pct}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-blue-200/30">No audits in period</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}