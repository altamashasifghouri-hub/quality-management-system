"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { createClient } from "@/lib/supabase/client";

type Finding = {
  type?: string;
  department?: string;
  detail?: string;
  ncr_number?: string;
  resolved?: boolean;
  timeline?: number;
};

type Plan = {
  id: string;
  title: string;
  branch_name: string;
  date_of_plan?: string;
  audit_period?: string;
  document_number?: string;
  findings: Finding[];
};

const TIMELINE_DAYS: Record<string, number> = { Critical: 2, High: 4, Medium: 7, Low: 10 };

function typeColor(type?: string) {
  switch ((type || "").toLowerCase()) {
    case "critical":
      return "bg-red-500/20 border-red-500/40 text-red-300";
    case "major":
      return "bg-orange-500/20 border-orange-500/40 text-orange-300";
    case "minor":
      return "bg-yellow-500/20 border-yellow-500/40 text-yellow-300";
    case "observation":
      return "bg-cyan-500/20 border-cyan-500/40 text-cyan-300";
    default:
      return "bg-blue-500/20 border-blue-500/40 text-blue-300";
  }
}

function parseDate(d?: string) {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

function timelineStatus(f: Finding, plan: Plan) {
  const days = f.timeline ?? TIMELINE_DAYS[f.type || ""] ?? 7;
  const anchor = parseDate(plan.date_of_plan);
  let label: string;
  let cls: string;
  if (f.resolved) {
    label = "Closed";
    cls = "bg-green-500/20 border-green-500/40 text-green-300";
  } else if (!anchor) {
    label = `${days} days`;
    cls = "bg-amber-500/20 border-amber-500/40 text-amber-300";
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    anchor.setHours(0, 0, 0, 0);
    const due = new Date(anchor);
    due.setDate(due.getDate() + days);
    due.setHours(0, 0, 0, 0);
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0) {
      label = `Crossed by ${Math.abs(diff)} day${Math.abs(diff) !== 1 ? "s" : ""}`;
      cls = "bg-red-500/20 border-red-500/40 text-red-300";
    } else if (diff === 0) {
      label = "Due today";
      cls = "bg-orange-500/20 border-orange-500/40 text-orange-300";
    } else {
      label = `${diff} day${diff !== 1 ? "s" : ""} remaining`;
      cls = "bg-amber-500/20 border-amber-500/40 text-amber-300";
    }
  }
  return { label, cls };
}

export default function TimelinesPage() {
  const supabase = createClient();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());
  const branchInitDone = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: audits }, { data: b }, { data: schedules }] = await Promise.all([
      supabase.from("internal_audits").select("*").order("created_at", { ascending: false }),
      supabase.from("branches").select("*"),
      supabase.from("audit_schedules").select("*"),
    ]);
    const branchName = new Map<string, string>((b || []).map((r: any) => [r.id, r.name]));
    const schedBranch = new Map<string, string>((schedules || []).map((sc: any) => [sc.id, branchName.get(sc.branch_id) || ""]));
    const mapped: Plan[] = (audits || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      branch_name: branchName.get(r.branch_id) || schedBranch.get(r.schedule_id) || "Unassigned",
      date_of_plan: r.date_of_plan,
      audit_period: r.audit_period,
      document_number: r.document_number,
      findings: r.findings || [],
    }));
    setPlans(mapped);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!loading && plans.length > 0 && !branchInitDone.current) {
      branchInitDone.current = true;
      setExpandedBranches(new Set(plans.map((p) => p.branch_name)));
    }
  }, [loading, plans]);

  const branchGroups = useMemo(() => {
    const map = new Map<string, Plan[]>();
    plans.forEach((p) => {
      const list = map.get(p.branch_name) || [];
      list.push(p);
      map.set(p.branch_name, list);
    });
    return Array.from(map.entries()).map(([name, ps]) => ({ name, plans: ps }));
  }, [plans]);

  function toggleBranch(name: string) {
    setExpandedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function togglePlan(id: string) {
    setExpandedPlans((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const totalNcrs = plans.reduce((sum, p) => sum + p.findings.filter((f) => f.ncr_number).length, 0);
  const overdue = plans.reduce((sum, p) => sum + p.findings.filter((f) => {
    if (f.resolved) return false;
    const days = f.timeline ?? TIMELINE_DAYS[f.type || ""] ?? 7;
    const anchor = parseDate(p.date_of_plan);
    if (!anchor) return false;
    const due = new Date(anchor); due.setDate(due.getDate() + days); due.setHours(0, 0, 0, 0);
    return due.getTime() < new Date(new Date().toDateString()).getTime();
  }).length, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/audit" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to Audit Management
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">Timelines</h1>
        <p className="text-blue-200/60 mb-8">
          Track every NCR against its resolution deadline. {totalNcrs > 0 && (
            <span>Out of {totalNcrs} NCR{totalNcrs !== 1 ? "s" : ""}, <span className="text-red-300">{overdue}</span> {overdue !== 1 ? "are" : "is"} overdue.</span>
          )}
        </p>

        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : plans.length === 0 ? (
          <p className="text-blue-200/40 text-center py-16">No audits recorded yet.</p>
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
                        const planOpen = expandedPlans.has(plan.id);
                        const ncrs = plan.findings.filter((f) => f.ncr_number);
                        if (ncrs.length === 0) return null;
                        return (
                          <div key={plan.id} className="space-y-4">
                            <button onClick={() => togglePlan(plan.id)} className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-2 hover:border-amber-400/40 transition-colors">
                              <div className="flex items-center gap-2 flex-wrap">
                                <svg className={`w-4 h-4 text-purple-300 transition-transform ${planOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                                <span className="text-white font-medium">{plan.title}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-200/40">{[plan.document_number, plan.date_of_plan, plan.audit_period].filter(Boolean).join(" · ")}</span>
                                <span className="text-xs text-purple-300 bg-purple-500/20 px-2 py-1 rounded-full border border-purple-500/30">{ncrs.length} NCR{ncrs.length !== 1 ? "s" : ""}</span>
                              </div>
                            </button>

                            {planOpen && (
                              <div className="pl-3 sm:pl-5 border-l border-amber-400/20 space-y-3">
                                {ncrs.map((f, idx) => {
                                  const st = timelineStatus(f, plan);
                                  return (
                                    <div key={`${plan.id}-${idx}`} className="bg-gradient-to-br from-blue-500/10 via-slate-800/40 to-slate-900/60 backdrop-blur-md border border-blue-400/20 rounded-xl p-4">
                                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                        {f.ncr_number && (
                                          <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-200">{f.ncr_number}</span>
                                        )}
                                        <span className={`px-2 py-0.5 text-xs rounded-full border ${typeColor(f.type)}`}>{f.type}</span>
                                        {f.department && (
                                          <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200">{f.department}</span>
                                        )}
                                        <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full border ${st.cls}`}>{st.label}</span>
                                      </div>
                                      {f.detail && (
                                        <p className="text-sm text-blue-100/80 line-clamp-2">{String(f.detail).trim()}</p>
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
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}