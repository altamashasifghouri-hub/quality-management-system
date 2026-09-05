"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

interface Finding { department: string; clause?: string; type: string; detail: string; recommendation?: string; evidence?: string[]; resolved?: boolean; }
interface AuditPlan {
  id: string;
  title: string;
  branch_id: string;
  branch_name: string;
  document_number: string | null;
  created_at: string;
  date_of_plan: string | null;
  audit_period: string | null;
  source: "internal" | "iso";
  findings: Finding[];
}

const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;

function severities(findings: Finding[]) {
  const s: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  findings.forEach((f) => { if (s[f.type] !== undefined) s[f.type] += 1; });
  return s;
}

function planStatus(plan: AuditPlan) {
  const total = plan.findings.length;
  if (!total) return { label: "No Findings", cls: "text-blue-200/40 bg-white/5 border-white/10", done: 0, total, pct: null as null | number, clear: false };
  const done = plan.findings.filter((f) => f.resolved === true).length;
  const pct = Math.round((done / total) * 100);
  const clear = done === total;
  return {
    label: clear ? "Clear" : "Unclear",
    cls: clear ? "text-green-300 bg-green-500/10 border-green-500/30" : "text-amber-300 bg-amber-500/10 border-amber-500/30",
    done, total, pct, clear,
  };
}

function fmtDate(d: string | null) {
  if (!d) return "";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const sevColor: Record<string, string> = {
  Critical: "text-red-300 bg-red-500/20 border-red-500/30",
  High: "text-orange-200 bg-orange-500/20 border-orange-500/30",
  Medium: "text-amber-200 bg-amber-500/20 border-amber-500/30",
  Low: "text-blue-200 bg-blue-500/20 border-blue-500/30",
};
const sevBg: Record<string, string> = {
  Critical: "border-red-500/40 text-red-300",
  High: "border-orange-500/40 text-orange-200",
  Medium: "border-amber-500/40 text-amber-200",
  Low: "border-blue-500/40 text-blue-200",
};

export default function AuditFindings() {
  const supabase = createClient();
  const [plans, setPlans] = useState<AuditPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [expandedBranch, setExpandedBranch] = useState<string | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 4000); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 5000); }

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
    const intPlans: AuditPlan[] = (p || []).map((r: any) => ({
      id: r.id, title: r.title, branch_id: r.branch_id, branch_name: branchName.get(r.branch_id) || "Unassigned",
      document_number: r.document_number, created_at: r.created_at, date_of_plan: r.date_of_plan,
      audit_period: r.audit_period, findings: r.findings || [], source: "internal",
    }));
    const isoArr: AuditPlan[] = (isoPlans || []).map((r: any) => ({
      id: r.id, title: r.title, branch_id: r.branch_id, branch_name: isoBranch.get(r.schedule_id) || "Unassigned",
      document_number: r.document_number, created_at: r.created_at, date_of_plan: r.date_of_plan,
      audit_period: r.audit_period, findings: r.findings || [], source: "iso",
    }));
    setPlans([...intPlans, ...isoArr].sort((a, z) => (z.created_at || "").localeCompare(a.created_at || "")));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function updateLocal(planId: string, findings: Finding[]) {
    setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, findings } : p)));
  }

  async function persist(planId: string, findings: Finding[]) {
    const plan = plans.find((p) => p.id === planId);
    const table = plan?.source === "iso" ? "audit_plans" : "internal_audits";
    const { error: err } = await supabase.from(table).update({ findings, updated_at: new Date().toISOString() }).eq("id", planId);
    if (err) showErr(err.message);
  }

  async function toggleResolved(planId: string, idx: number) {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const updated = plan.findings.map((f, i) => (i === idx ? { ...f, resolved: !(f.resolved === true) } : f));
    updateLocal(planId, updated);
    await persist(planId, updated);
  }

  async function changeType(planId: string, idx: number, type: string) {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const updated = plan.findings.map((f, i) => (i === idx ? { ...f, type } : f));
    updateLocal(planId, updated);
    await persist(planId, updated);
  }

  async function addEvidence(planId: string, idx: number, file: File | null) {
    const plan = plans.find((p) => p.id === planId);
    if (!plan || !file) return;
    if (!file.type.startsWith("image/")) return showErr("Evidence must be an image.");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/drive-upload-image", { method: "POST", body: fd });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      if (errJson?.error === "not_connected") return showErr("Connect Google Drive first from the Storage page.");
      return showErr(errJson?.error?.message || "Picture upload failed.");
    }
    const json = await res.json();
    if (!json.url) return showErr("Picture upload failed.");
    const updated = plan.findings.map((f, i) => (i === idx ? { ...f, evidence: [...(f.evidence || []), json.url] } : f));
    updateLocal(planId, updated);
    await persist(planId, updated);
    showMsg("Picture added.");
  }

  async function removeEvidence(planId: string, idx: number, evIdx: number) {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const updated = plan.findings.map((f, i) => (i === idx ? { ...f, evidence: (f.evidence || []).filter((_, j) => j !== evIdx) } : f));
    updateLocal(planId, updated);
    await persist(planId, updated);
  }

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
        <p className="text-blue-200/60 mb-2">Mark findings resolved as you fix them — an audit is Clear when everything is resolved</p>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

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
                      const st = planStatus(plan);
                      const s = severities(plan.findings);
                      return (
                        <div key={plan.id}>
                          <button
                            onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                            className="w-full px-6 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-white/5 transition-colors text-left"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-white font-medium">{plan.title}</h3>
                                <span className={`px-2 py-0.5 text-[10px] rounded-full ${plan.source === "iso" ? "bg-blue-500/20 border border-blue-500/30 text-blue-200" : "bg-purple-500/20 border border-purple-500/30 text-purple-200"}`}>
                                  {plan.source === "iso" ? "ISO 9001" : "Internal"}
                                </span>
                              </div>
                              <p className="text-xs text-blue-200/40 mt-1">
                                {[plan.document_number, fmtDate(plan.date_of_plan), plan.audit_period].filter(Boolean).join(" · ") || "No date"}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                              {st.pct !== null ? (
                                <>
                                  <span className={`px-3 py-1 text-xs font-medium rounded-full border ${st.cls}`}>
                                    {st.label}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <div className="w-28 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all" style={{ width: `${st.pct}%` }} />
                                    </div>
                                    <span className="text-xs text-white/60 whitespace-nowrap">{st.done}/{st.total} · {st.pct}%</span>
                                  </div>
                                </>
                              ) : (
                                <span className={`px-3 py-1 text-xs font-medium rounded-full border ${st.cls}`}>{st.label}</span>
                              )}
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
                                <span className={`px-3 py-1 text-xs rounded-full border ${st.cls}`}>{st.label} · {st.pct === null ? "—" : `${st.pct}%`}</span>
                              </div>

                              {plan.findings.length === 0 ? (
                                <p className="text-sm text-blue-200/40">No findings generated for this audit yet. Go to Audit Records → Internal or Audit Report → ISO 9001 to generate them from your notes.</p>
                              ) : (
                                <div className="space-y-3">
                                  {plan.findings.map((f, i) => {
                                    const resolved = f.resolved === true;
                                    return (
                                      <div key={i} className={`bg-white/[0.03] border rounded-xl p-4 transition-colors ${resolved ? "border-green-500/30" : "border-white/10"}`}>
                                        <div className="flex items-start justify-between gap-4">
                                          <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                              <select
                                                value={f.type}
                                                onChange={(e) => changeType(plan.id, i, e.target.value)}
                                                className={`px-2 py-1 text-xs rounded-lg border bg-slate-900 [color-scheme:dark] ${sevBg[f.type] || sevBg.Medium}`}
                                              >
                                                {SEVERITIES.map((sev) => <option key={sev} value={sev} className="bg-slate-900">{sev}</option>)}
                                              </select>
                                              <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200">{f.department}</span>
                                              {f.clause && <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-200">Clause {f.clause}</span>}
                                              <span className="text-[10px] uppercase tracking-wide text-blue-200/40">Issue #{String(i + 1).padStart(2, "0")}</span>
                                            </div>
                                            <p className={`text-sm ${resolved ? "text-white/50 line-through" : "text-white/80"}`}>{f.detail}</p>
                                            {f.recommendation && (
                                              <p className="text-xs text-blue-200/60 mt-2"><span className="text-blue-300">Recommendation:</span> {f.recommendation}</p>
                                            )}

                                            <div className="flex flex-wrap items-center gap-2 mt-3">
                                              <div className="flex flex-wrap gap-2">
                                                {(f.evidence || []).map((url, j) => (
                                                  <div key={j} className="relative group">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`Evidence ${j + 1}`} className="w-20 h-16 object-cover rounded-lg border border-white/20 hover:opacity-80 transition-opacity" /></a>
                                                    <button
                                                      type="button"
                                                      onClick={() => removeEvidence(plan.id, i, j)}
                                                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] leading-none hidden group-hover:flex items-center justify-center"
                                                    >
                                                      ×
                                                    </button>
                                                  </div>
                                                ))}
                                              </div>
                                              <label className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] cursor-pointer text-center">
                                                + Picture
                                                <input type="file" accept="image/*" className="hidden" onChange={(e) => { addEvidence(plan.id, i, e.target.files?.[0] || null); e.target.value = ""; }} />
                                              </label>
                                            </div>
                                          </div>

                                          <div className="shrink-0 flex flex-col items-end gap-2">
                                            <button
                                              type="button"
                                              onClick={() => toggleResolved(plan.id, i)}
                                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${resolved ? "bg-green-500/15 border-green-500/40 text-green-300" : "bg-white/5 border-white/15 text-white/60 hover:text-white"}`}
                                            >
                                              <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${resolved ? "bg-green-500 border-green-500 text-white" : "border-white/30 text-transparent"}`}>
                                                ✓
                                              </span>
                                              {resolved ? "Resolved" : "Unresolved"}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
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