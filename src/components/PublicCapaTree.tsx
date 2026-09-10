"use client";

import { useMemo, useState } from "react";

export type PublicFinding = {
  type?: string;
  department?: string;
  detail?: string;
  ncr_number?: string;
  capa_pdf_url?: string;
  resolved?: boolean;
};

export type PublicPlan = {
  id: string;
  title: string;
  branch_name: string;
  document_number?: string;
  date_of_plan?: string;
  audit_period?: string;
  findings: PublicFinding[];
};

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

function auditStatus(findings: PublicFinding[]) {
  if (findings.length === 0) return { label: "No Findings", cls: "bg-white/5 border-white/15 text-neutral-300" };
  const cleared = findings.filter((f) => f.resolved).length;
  if (cleared === findings.length)
    return { label: "Cleared", cls: "bg-green-500/20 border-green-500/40 text-green-300" };
  if (cleared > 0)
    return { label: `${cleared}/${findings.length} Cleared`, cls: "bg-amber-500/20 border-amber-500/40 text-amber-300" };
  return { label: "Not Cleared", cls: "bg-red-500/20 border-red-500/40 text-red-300" };
}

export default function PublicCapaTree({ plans }: { plans: PublicPlan[] }) {
  const branchGroups = useMemo(() => {
    const map = new Map<string, PublicPlan[]>();
    plans.forEach((p) => {
      const list = map.get(p.branch_name) || [];
      list.push(p);
      map.set(p.branch_name, list);
    });
    return Array.from(map.entries()).map(([name, ps]) => ({ name, plans: ps }));
  }, [plans]);

  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(
    () => new Set(branchGroups.map((g) => g.name))
  );
  const [expandedPlans, setExpandedPlans] = useState<Set<string>>(new Set());

  function toggleBranch(name: string) {
    setExpandedBranches((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function togglePlan(id: string) {
    setExpandedPlans((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (plans.length === 0) {
    return <p className="text-blue-200/60">No audit findings have been published yet.</p>;
  }

  return (
    <div className="space-y-8">
      {branchGroups.map((group) => {
        const totalFindings = group.plans.reduce((n, p) => n + p.findings.length, 0);
        const branchOpen = expandedBranches.has(group.name);
        return (
          <div key={group.name}>
            <button
              onClick={() => toggleBranch(group.name)}
              className="w-full flex items-center gap-2 text-lg font-semibold text-white mb-3 hover:text-blue-300 transition-colors"
            >
              <svg className={`w-5 h-5 text-blue-400 transition-transform ${branchOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              {group.name}
              <span className="text-xs text-blue-200/40">· {totalFindings} finding{totalFindings !== 1 ? "s" : ""}</span>
              <span className="text-xs text-blue-300/60">{branchOpen ? "· (collapse)" : "· (open)"}</span>
            </button>

            {branchOpen && (
              <div className="space-y-6">
                {group.plans.map((plan) => {
                  const planOpen = expandedPlans.has(plan.id);
                  const st = auditStatus(plan.findings);
                  return (
                    <div key={plan.id} className="space-y-4">
                      <button
                        onClick={() => togglePlan(plan.id)}
                        className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-5 py-3 flex flex-wrap items-center justify-between gap-2 hover:border-blue-400/40 transition-colors"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <svg className={`w-4 h-4 text-purple-300 transition-transform ${planOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                          <span className="text-white font-medium flex items-center gap-2 flex-wrap">
                            {plan.title}
                            <span className="px-2 py-0.5 text-[10px] rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200">
                              Internal
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-1 text-xs font-medium rounded-full border ${st.cls}`}>{st.label}</span>
                          <span className="text-xs text-blue-200/40">{plan.document_number}</span>
                          <span className="text-xs text-purple-300 bg-purple-500/20 px-2 py-1 rounded-full border border-purple-500/30">{plan.findings.length} finding{plan.findings.length !== 1 ? "s" : ""}</span>
                        </div>
                      </button>

                      {planOpen && (
                        <div className="pl-3 sm:pl-5 border-l border-blue-400/20 space-y-4">
                          {plan.findings.map((f, idx) => (
                            <div key={`${plan.id}-${idx}`} className="bg-gradient-to-br from-blue-500/10 via-slate-800/40 to-slate-900/60 backdrop-blur-md border border-blue-400/20 rounded-2xl p-5">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span className={`px-2 py-0.5 text-xs rounded-full border ${typeColor(f.type)}`}>{f.type}</span>
                                {f.department && (
                                  <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200">{f.department}</span>
                                )}
                                <span className="text-[10px] uppercase tracking-wide text-blue-200/40">Issue #{String(idx + 1).padStart(2, "0")}</span>
                                {f.ncr_number && (
                                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-200">{f.ncr_number}</span>
                                )}
                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${f.resolved ? "bg-green-500/20 border-green-500/40 text-green-300" : "bg-red-500/20 border-red-500/40 text-red-300"}`}>
                                  {f.resolved ? "Cleared" : "Open"}
                                </span>
                              </div>
                              {f.detail && (
                                <p className="text-sm text-blue-100/80 mb-3">{String(f.detail).trim()}</p>
                              )}
                              {f.capa_pdf_url && (
                                <a
                                  href={f.capa_pdf_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-600/90 hover:bg-green-500 text-white text-xs font-medium transition-all duration-200"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 19.5 15-15m0 0H8.25m11.25 0v11.25" />
                                  </svg>
                                  View CAPA
                                </a>
                              )}
                            </div>
                          ))}
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
  );
}