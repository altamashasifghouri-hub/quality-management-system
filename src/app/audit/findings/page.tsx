"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

interface Finding { department: string; type: string; detail: string; recommendation?: string; evidence?: string[]; }
interface AuditPlan {
  id: string;
  title: string;
  branch_id: string;
  branch_name: string;
  document_number: string | null;
  created_at: string;
  date_of_plan: string | null;
  audit_period: string | null;
  findings: Finding[];
}

const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;

function severities(findings: Finding[]) {
  const s: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  findings.forEach((f) => { if (s[f.type] !== undefined) s[f.type] += 1; });
  return s;
}

function fmtDate(d: string | null) {
  if (!d) return "";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const sevColor: Record<string, string> = {
  Critical: "bg-red-500/20 text-red-300 border-red-500/30",
  High: "bg-orange-500/20 text-orange-200 border-orange-500/30",
  Medium: "bg-amber-500/20 text-amber-200 border-amber-500/30",
  Low: "bg-blue-500/20 text-blue-200 border-blue-500/30",
};

export default function AuditFindings() {
  const supabase = createClient();
  const [plans, setPlans] = useState<AuditPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedBranch, setExpandedBranch] = useState<string | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: b }] = await Promise.all([
      supabase.from("internal_audits").select("*").order("created_at", { ascending: false }),
      supabase.from("branches").select("*"),
    ]);
    const branchName = new Map<string, string>((b || []).map((r: any) => [r.id, r.name]));
    setPlans((p || []).map((r: any) => ({
      id: r.id, title: r.title, branch_id: r.branch_id, branch_name: branchName.get(r.branch_id) || "Unassigned",
      document_number: r.document_number, created_at: r.created_at, date_of_plan: r.date_of_plan,
      audit_period: r.audit_period, findings: r.findings || [],
    })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const branches: { name: string; plans: AuditPlan[] }[] = [];
  const branchMap = new Map<string, AuditPlan[]>();
  plans.forEach((p) => {
    const list = branchMap.get(p.branch_name) || [];
    list.push(p);
    branchMap.set(p.branch_name, list);
  });
  branchMap.forEach((list, name) => branches.push({ name, plans: list }));

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

        <h1 className="text-3xl font-bold text-white mb-2">Findings and Evidences</h1>
        <p className="text-blue-200/60 mb-8">Generated findings per audit, with evidence for each issue</p>

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : branches.length === 0 ? (
          <p className="text-blue-200/40 text-center py-16">No audit plans yet. Record an audit to generate findings.</p>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {branches.map((b) => {
                const findings = b.plans.reduce<Finding[]>((acc, p) => acc.concat(p.findings), []);
                const s = severities(findings);
                return (
                  <button
                    key={b.name}
                    onClick={() => setExpandedBranch(expandedBranch === b.name ? null : b.name)}
                    className={`text-left bg-white/5 backdrop-blur-sm border rounded-xl p-5 transition-all hover:bg-white/10 ${expandedBranch === b.name ? "border-purple-500/50" : "border-white/10"}`}
                  >
                    <h3 className="text-white font-semibold">{b.name}</h3>
                    <p className="text-xs text-blue-200/40 mt-1">{b.plans.length} audit{b.plans.length !== 1 ? "s" : ""} · {findings.length} finding{findings.length !== 1 ? "s" : ""}</p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {SEVERITIES.map((sev) => s[sev] > 0 && (
                        <span key={sev} className={`px-2 py-0.5 text-xs rounded-full border ${sevColor[sev]}`}>{sev}: {s[sev]}</span>
                      ))}
                      {findings.length === 0 && <span className="px-2 py-0.5 text-xs rounded-full bg-white/5 border border-white/10 text-blue-200/50">No findings yet</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {expandedBranch && (() => {
              const group = branches.find((b) => b.name === expandedBranch);
              if (!group) return null;
              return (
                <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">{group.name}</h2>
                    <button onClick={() => setExpandedBranch(null)} className="text-xs text-blue-300 hover:text-white">Collapse</button>
                  </div>
                  <div className="divide-y divide-white/5">
                    {group.plans.length === 0 && <p className="text-blue-200/40 px-6 py-8 text-sm">No audits in this branch.</p>}
                    {group.plans.map((plan) => {
                      const s = severities(plan.findings);
                      return (
                        <div key={plan.id}>
                          <button
                            onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                            className="w-full px-6 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-white/5 transition-colors text-left"
                          >
                            <div className="min-w-0">
                              <h3 className="text-white font-medium">{plan.title}</h3>
                              <p className="text-xs text-blue-200/40 mt-1">
                                {[plan.document_number, fmtDate(plan.date_of_plan), plan.audit_period].filter(Boolean).join(" · ") || "No date"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-blue-200/50">{plan.findings.length} finding{plan.findings.length !== 1 ? "s" : ""}</span>
                              <svg className={`w-4 h-4 text-blue-400 transition-transform ${expandedPlan === plan.id ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                            </div>
                          </button>

                          {expandedPlan === plan.id && (
                            <div className="px-6 pb-6">
                              <div className="flex flex-wrap gap-2 mb-4">
                                {SEVERITIES.map((sev) => (
                                  <span key={sev} className={`px-3 py-1 text-xs rounded-full border ${sevColor[sev]}`}>{sev}: {s[sev]}</span>
                                ))}
                              </div>

                              {plan.findings.length === 0 ? (
                                <p className="text-sm text-blue-200/40">No findings generated for this audit yet. Go to Audit Records → Internal to generate them from your notes.</p>
                              ) : (
                                <div className="space-y-3">
                                  {plan.findings.map((f, i) => (
                                    <div key={i} className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                                      <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <span className={`px-2 py-0.5 text-xs rounded-full border ${sevColor[f.type] || sevColor.Medium}`}>{f.type}</span>
                                        <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200">{f.department}</span>
                                        {f.recommendation && <span className="text-[10px] uppercase tracking-wide text-blue-200/40">Issue #{String(i + 1).padStart(2, "0")}</span>}
                                      </div>
                                      <p className="text-sm text-white/80">{f.detail}</p>
                                      {f.recommendation && (
                                        <p className="text-xs text-blue-200/60 mt-2"><span className="text-blue-300">Recommendation:</span> {f.recommendation}</p>
                                      )}
                                      {f.evidence && f.evidence.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-3">
                                          {f.evidence.map((url, j) => (
                                            <a key={j} href={url} target="_blank" rel="noopener noreferrer" className="block">
                                              {/* eslint-disable-next-line @next/next/no-img-element */}
                                              <img src={url} alt={`Evidence ${j + 1}`} className="w-24 h-20 object-cover rounded-lg border border-white/20 hover:opacity-80 transition-opacity" />
                                            </a>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
}