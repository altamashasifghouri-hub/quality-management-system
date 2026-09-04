"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

interface Finding { clause: string; detail: string; type: "Observation" | "Nonconformity" | "Opportunity"; }
interface Nonconformity { clause: string; description: string; corrective_action: string; target_date: string; responsible: string; status: string; }

interface AuditPlan {
  id: string; schedule_id: string; title: string;
  branch_name?: string; status: string; overall_result: string;
  findings: Finding[]; nonconformities: Nonconformity[];
}

export default function AuditFindings() {
  const supabase = createClient();
  const [plans, setPlans] = useState<AuditPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const [branchFilter, setBranchFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: p } = await supabase.from("audit_plans").select("*").order("created_at", { ascending: false });
    const { data: s } = await supabase.from("audit_schedules").select("*, branches(name)");
    const schedMap = new Map((s || []).map((r: any) => [r.id, r.branches?.name || ""]));
    setPlans((p || []).map((r: any) => ({
      id: r.id, schedule_id: r.schedule_id, title: r.title,
      branch_name: schedMap.get(r.schedule_id) || "",
      status: r.status || "Draft", overall_result: r.overall_result || "Open",
      findings: r.findings || [], nonconformities: r.nonconformities || [],
    })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const branches = Array.from(new Set(plans.map((p) => p.branch_name).filter(Boolean))).sort();

  const allFindings: { plan: AuditPlan; finding: Finding }[] = [];
  const allNCs: { plan: AuditPlan; nc: Nonconformity }[] = [];
  plans.forEach((plan) => {
    const br = branchFilter === "all" || plan.branch_name === branchFilter;
    if (!br) return;
    plan.findings.forEach((finding) => {
      if (typeFilter === "all" || finding.type === typeFilter) allFindings.push({ plan, finding });
    });
    plan.nonconformities.forEach((nc) => {
      if (statusFilter === "all" || nc.status === statusFilter) allNCs.push({ plan, nc });
    });
  });

  const totalFindings = plans.reduce((n, p) => n + (p.findings?.length || 0), 0);
  const openNCs = plans.reduce((n, p) => n + (p.nonconformities?.filter((nc) => nc.status !== "Closed").length || 0), 0);
  const closedNCs = plans.reduce((n, p) => n + (p.nonconformities?.filter((nc) => nc.status === "Closed").length || 0), 0);

  async function setNcStatus(plan: AuditPlan, index: number, status: string) {
    const updated = plan.nonconformities.map((nc, i) => (i === index ? { ...nc, status } : nc));
    setSavingId(`${plan.id}-${index}`);
    const { error: err } = await supabase.from("audit_plans").update({ nonconformities: updated }).eq("id", plan.id);
    setSavingId(null);
    if (err) return setError(err.message);
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, nonconformities: updated } : p)));
  }

  const statusBadge = (status: string) =>
    status === "Closed"
      ? "bg-green-500/20 text-green-300"
      : status === "Open"
      ? "bg-red-500/20 text-red-300"
      : "bg-amber-500/20 text-amber-300";

  const typeBadge = (type: string) =>
    type === "Nonconformity"
      ? "bg-red-500/20 text-red-300"
      : type === "Opportunity"
      ? "bg-blue-500/20 text-blue-300"
      : "bg-amber-500/20 text-amber-300";

  const selectCls = "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]";

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

        <h1 className="text-3xl font-bold text-white mb-2">Audit Findings</h1>
        <p className="text-blue-200/60 mb-8">Track findings, observations and nonconformities across all audit plans</p>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 text-center">
            <div className="text-3xl font-bold text-white">{totalFindings}</div>
            <div className="text-xs text-blue-200/60 mt-1">Total Findings</div>
          </div>
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 text-center">
            <div className="text-3xl font-bold text-red-300">{openNCs}</div>
            <div className="text-xs text-blue-200/60 mt-1">Open Nonconformities</div>
          </div>
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-5 text-center">
            <div className="text-3xl font-bold text-green-300">{closedNCs}</div>
            <div className="text-xs text-blue-200/60 mt-1">Closed Nonconformities</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className={selectCls}>
            <option value="all" className="bg-slate-800">All Branches</option>
            {branches.map((b) => (<option key={b} value={b} className="bg-slate-800">{b}</option>))}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectCls}>
            <option value="all" className="bg-slate-800">All Finding Types</option>
            <option value="Observation" className="bg-slate-800">Observation</option>
            <option value="Nonconformity" className="bg-slate-800">Nonconformity</option>
            <option value="Opportunity" className="bg-slate-800">Opportunity</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
            <option value="all" className="bg-slate-800">All NC Statuses</option>
            <option value="Open" className="bg-slate-800">Open</option>
            <option value="Closed" className="bg-slate-800">Closed</option>
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : plans.length === 0 ? (
          <p className="text-blue-200/40 text-center py-16">No audit plans yet. Create a plan to start recording findings.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">Findings</h2>
              </div>
              {allFindings.length === 0 ? (
                <p className="text-blue-200/40 text-center py-10 text-sm">No findings match.</p>
              ) : (
                <div className="divide-y divide-white/5">
                  {allFindings.map(({ plan, finding }, i) => (
                    <div key={i} className="px-6 py-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${typeBadge(finding.type)}`}>{finding.type}</span>
                        <span className="text-xs text-blue-200/50">Clause {finding.clause}</span>
                      </div>
                      <p className="text-sm text-white/80 mb-1">{finding.detail}</p>
                      <p className="text-xs text-blue-200/40">{plan.title}{plan.branch_name ? ` · ${plan.branch_name}` : ""}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">Nonconformities & Corrective Actions</h2>
              </div>
              {allNCs.length === 0 ? (
                <p className="text-blue-200/40 text-center py-10 text-sm">No nonconformities match.</p>
              ) : (
                <div className="divide-y divide-white/5">
                  {allNCs.map(({ plan, nc }, i) => (
                    <div key={i} className="px-6 py-4">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-300 font-medium">Clause {nc.clause}</span>
                          <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${statusBadge(nc.status)}`}>{nc.status}</span>
                        </div>
                        <select
                          value={nc.status}
                          disabled={savingId === `${plan.id}-${i}`}
                          onChange={(e) => setNcStatus(plan, i, e.target.value)}
                          className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
                        >
                          <option value="Open" className="bg-slate-800">Open</option>
                          <option value="Closed" className="bg-slate-800">Closed</option>
                        </select>
                      </div>
                      <p className="text-sm text-white/80 mb-1">{nc.description}</p>
                      {nc.corrective_action && <p className="text-xs text-blue-200/50 mb-1">Action: {nc.corrective_action}</p>}
                      <div className="flex flex-wrap gap-3 text-xs text-blue-200/40 mb-2">
                        {nc.target_date && <span>Target: {nc.target_date}</span>}
                        {nc.responsible && <span>Responsible: {nc.responsible}</span>}
                      </div>
                      <p className="text-xs text-blue-200/40">{plan.title}{plan.branch_name ? ` · ${plan.branch_name}` : ""}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}