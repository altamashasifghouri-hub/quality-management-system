"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

interface Finding { department: string; clause?: string; type: string; detail: string; recommendation?: string; evidence?: string[]; resolved?: boolean; }
interface Schedule { id: string; branch_id: string; branch_name?: string; date_from: string; date_to: string; departments: string[]; }
interface Plan { id: string; schedule_id: string; title: string; criteria: string; description: string | null; findings: Finding[]; overall_result: string; created_at: string; branch_name?: string; }

const ISO_CLAUSES = [
  { clause: "4", title: "Context of the Organization", items: [
    "4.1 Understanding the organization and its context",
    "4.2 Interested parties and their requirements",
    "4.3 Scope of the QMS",
    "4.4 QMS and its processes",
  ]},
  { clause: "5", title: "Leadership", items: [
    "5.1 Leadership and commitment",
    "5.2 Quality policy",
    "5.3 Organizational roles, responsibilities and authorities",
  ]},
  { clause: "6", title: "Planning", items: [
    "6.1 Actions to address risks and opportunities",
    "6.2 Quality objectives and planning to achieve them",
    "6.3 Planning of changes",
  ]},
  { clause: "7", title: "Support", items: [
    "7.1 Resources (people, infrastructure, environment)",
    "7.2 Competence",
    "7.3 Awareness",
    "7.4 Communication",
    "7.5 Documented information",
  ]},
  { clause: "8", title: "Operation", items: [
    "8.1 Operational planning and control",
    "8.2 Requirements for products and services",
    "8.3 Design and development",
    "8.4 Control of externally provided processes",
    "8.5 Production and service provision",
    "8.6 Release of products and services",
    "8.7 Control of nonconforming outputs",
  ]},
  { clause: "9", title: "Performance Evaluation", items: [
    "9.1 Monitoring, measurement, analysis and evaluation",
    "9.2 Internal audit",
    "9.3 Management review",
  ]},
  { clause: "10", title: "Improvement", items: [
    "10.1 General",
    "10.2 Nonconformity and corrective action",
    "10.3 Continual improvement",
  ]},
];

const CLAUSE_ITEMS = ISO_CLAUSES.flatMap((c) => c.items);
const SEVERITIES = ["Critical", "High", "Medium", "Low"] as const;

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

function severities(findings: Finding[]) {
  const s: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  findings.forEach((f) => { if (s[f.type] !== undefined) s[f.type] += 1; });
  return s;
}

function planStatus(plan: Plan) {
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

export default function Iso9001Report() {
  const supabase = createClient();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [notepad, setNotepad] = useState("");
  const [notepadSaved, setNotepadSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lastGenerate, setLastGenerate] = useState<{ count: number; source: string } | null>(null);

  const [expandedBranch, setExpandedBranch] = useState<string | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 4000); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 5000); }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: schedData }, { data: planData }] = await Promise.all([
      supabase.from("audit_schedules").select("*, branches(name)").order("date_from"),
      supabase.from("audit_plans").select("*").order("created_at", { ascending: false }),
    ]);
    setSchedules((schedData || []).map((s: any) => ({
      id: s.id, branch_id: s.branch_id, branch_name: s.branches?.name || "",
      date_from: s.date_from, date_to: s.date_to, departments: s.departments || [],
    })));
    setPlans((planData || []).map((p: any) => {
      const sched = (schedData || []).find((sc: any) => sc.id === p.schedule_id);
      return {
        id: p.id, schedule_id: p.schedule_id, title: p.title, criteria: p.criteria || "ISO 9001:2015",
        description: p.description || null, findings: p.findings || [],
        overall_result: p.overall_result || "Open", created_at: p.created_at,
        branch_name: sched?.branches?.name || "",
      };
    }));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || null;
  const selectedSched = selectedPlan ? schedules.find((s) => s.id === selectedPlan.schedule_id) : null;

  function onPlanChange(id: string) {
    setSelectedPlanId(id);
    setNotepadSaved(false);
    setLastGenerate(null);
    const plan = plans.find((p) => p.id === id);
    setNotepad(plan?.description || "");
  }

  async function handleSaveNotes() {
    if (!selectedPlan) return;
    setSaving(true);
    const { error: err } = await supabase.from("audit_plans").update({
      description: notepad || null,
      updated_at: new Date().toISOString(),
    }).eq("id", selectedPlan.id);
    setSaving(false);
    if (err) return showErr(err.message);
    setPlans((prev) => prev.map((p) => (p.id === selectedPlan.id ? { ...p, description: notepad || null } : p)));
    setNotepadSaved(true);
    setTimeout(() => setNotepadSaved(false), 2500);
    showMsg("Notes saved.");
  }

  function updateLocal(planId: string, findings: Finding[]) {
    setPlans((prev) => prev.map((p) => (p.id === planId ? { ...p, findings } : p)));
  }

  async function persist(planId: string, findings: Finding[]) {
    const { error: err } = await supabase.from("audit_plans").update({ findings, updated_at: new Date().toISOString() }).eq("id", planId);
    if (err) showErr(err.message);
  }

  async function handleGenerate() {
    if (!selectedPlan) return;
    if (!notepad.trim()) return showErr("Write your audit findings notes in the notepad first.");
    setGenerating(true);
    setError("");
    setLastGenerate(null);
    try {
      const res = await fetch("/api/ai/findings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notepad,
          departments: selectedSched?.departments && selectedSched.departments.length ? selectedSched.departments : ["General"],
          clauses: CLAUSE_ITEMS,
          branchName: selectedPlan.branch_name,
          planTitle: selectedPlan.title,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return showErr(json?.error || "Generation failed. Try again.");
      const incoming: Finding[] = json.findings || [];
      const current: Finding[] = selectedPlan.findings || [];
      const existingKey = new Set(current.map((f) => `${(f.department || "").toLowerCase()}|${(f.clause || "").toLowerCase()}|${f.detail.trim().toLowerCase()}`));
      const merged: Finding[] = [...current];
      incoming.forEach((f) => {
        const key = `${(f.department || "").toLowerCase()}|${(f.clause || "").toLowerCase()}|${f.detail.trim().toLowerCase()}`;
        if (!existingKey.has(key)) {
          merged.push({
            department: f.department || "General",
            clause: f.clause || undefined,
            type: f.type,
            detail: f.detail,
            recommendation: f.recommendation,
            evidence: [],
            resolved: false,
          });
          existingKey.add(key);
        }
      });
      const { error: updErr } = await supabase.from("audit_plans").update({
        findings: merged,
        description: notepad || null,
        updated_at: new Date().toISOString(),
      }).eq("id", selectedPlan.id);
      if (updErr) return showErr(updErr.message);
      updateLocal(selectedPlan.id, merged);
      setLastGenerate({ count: merged.length, source: json.source || "generated" });
      showMsg(merged.length ? "Findings generated and organized by department and ISO clause." : "No findings were produced from these notes.");
    } catch (e: any) {
      showErr(e?.message || "Generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
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

  const branches: { name: string; plans: Plan[] }[] = [];
  const branchMap = new Map<string, Plan[]>();
  plans.forEach((p) => {
    const list = branchMap.get(p.branch_name || "Unassigned") || [];
    list.push(p);
    branchMap.set(p.branch_name || "Unassigned", list);
  });
  branchMap.forEach((list, name) => branches.push({ name, plans: list }));

  const inputCls = "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark] w-full";
  const selectCls = "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark] w-full";
  const labelCls = "block text-sm text-blue-200/60 mb-1";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/audit/report" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to Audit Report
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">ISO 9001 Report</h1>
            <p className="text-blue-200/60">Write your audit findings notes — AI organizes them by department and ISO clause</p>
          </div>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-5">
              <h2 className="text-xl font-bold text-white">Record the ISO 9001 audit</h2>

              <div>
                <label className={labelCls}>ISO 9001 Audit Plan</label>
                <select value={selectedPlanId} onChange={(e) => onPlanChange(e.target.value)} className={selectCls}>
                  <option value="">Select an audit plan</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-800">{p.branch_name || "Unassigned"} — {p.title} ({p.findings.length} finding{p.findings.length !== 1 ? "s" : ""})</option>
                  ))}
                </select>
                {plans.length === 0 && <p className="text-xs text-amber-300/70 mt-1">No ISO 9001 audit plans yet. Create one from Audit Plan → ISO 9001 first.</p>}
              </div>

              {selectedPlan && (
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-blue-300 mb-3">Audit details</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><span className="text-blue-200/50 block text-xs">Branch</span><span className="text-white">{selectedPlan.branch_name || "—"}</span></div>
                    <div><span className="text-blue-200/50 block text-xs">Audit Title</span><span className="text-white">{selectedPlan.title}</span></div>
                    <div><span className="text-blue-200/50 block text-xs">Audit Dates</span><span className="text-white">{selectedSched ? `${selectedSched.date_from} → ${selectedSched.date_to}` : "—"}</span></div>
                    <div><span className="text-blue-200/50 block text-xs">Criteria</span><span className="text-white">{selectedPlan.criteria}</span></div>
                  </div>
                  <div className="mt-3">
                    <span className="text-sm text-blue-200/60">Departments in this audit</span>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedSched?.departments.length ? selectedSched.departments.map((d) => (
                        <span key={d} className="px-3 py-1 text-xs rounded-full bg-blue-600/30 border border-blue-500/40 text-white">{d}</span>
                      )) : <span className="text-xs text-blue-200/40">No departments on the schedule — findings will be labeled General.</span>}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-blue-200/60">Findings notes (raw audit notes)</label>
                  {notepadSaved && <span className="text-xs text-green-300">✓ Saved</span>}
                </div>
                <textarea
                  value={notepad}
                  onChange={(e) => setNotepad(e.target.value)}
                  rows={10}
                  placeholder={"Write your audit findings notes here — one point per line.\nExample:\nKitchen cleaning schedules exist but temperature logs are not kept.\nWarehouse stock is properly labeled and rotated.\nTraining records for new hires are missing."}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
                <p className="text-xs text-blue-200/40 mt-1">Notes are saved to the audit record so they stay with the plan. The AI reads them and categorizes each finding by department and ISO clause.</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button onClick={handleSaveNotes} disabled={saving || !selectedPlan} className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors disabled:opacity-40">
                  {saving ? "Saving..." : "Save Notes"}
                </button>
                <button onClick={handleGenerate} disabled={generating || !selectedPlan} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-40">
                  {generating ? "Organizing findings..." : "Generate Findings by Department & Clause"}
                </button>
              </div>

              {lastGenerate && (
                <div className="bg-blue-500/10 border border-blue-500/30 text-blue-200 text-sm rounded-lg px-4 py-3">
                  Saved {lastGenerate.count} finding{lastGenerate.count !== 1 ? "s" : ""} to the audit record. Review them in the ISO 9001 Findings section below or in Findings and Evidences.
                </div>
              )}
            </div>

            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">ISO 9001 Findings & Evidences</h2>
                <p className="text-xs text-blue-200/40 mt-1">Only ISO 9001 audit findings, organized by department and clause. Mark resolved as you fix them.</p>
              </div>

              {branches.length === 0 ? (
                <p className="text-blue-200/40 text-center py-16">No ISO 9001 audit plans yet. Select a plan above to record findings.</p>
              ) : (
                <div className="p-6 space-y-4">
                  {branches.map((b) => {
                    const findings = b.plans.reduce<Finding[]>((acc, p) => acc.concat(p.findings), []);
                    const s = severities(findings);
                    return (
                      <div key={b.name} className="border border-white/10 rounded-xl overflow-hidden">
                        <button
                          onClick={() => setExpandedBranch(expandedBranch === b.name ? null : b.name)}
                          className={`w-full px-5 py-4 text-left hover:bg-white/5 transition-colors ${expandedBranch === b.name ? "border-blue-500/50 bg-white/[0.03]" : ""}`}
                        >
                          <h3 className="text-white font-semibold">{b.name}</h3>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <span className="text-xs text-blue-200/40">{b.plans.length} plan{b.plans.length !== 1 ? "s" : ""} · {findings.length} finding{findings.length !== 1 ? "s" : ""}</span>
                            {SEVERITIES.map((sev) => s[sev] > 0 && (
                              <span key={sev} className={`px-2 py-0.5 text-xs rounded-full border ${sevColor[sev]}`}>{sev}: {s[sev]}</span>
                            ))}
                            {findings.length === 0 && <span className="px-2 py-0.5 text-xs rounded-full bg-white/5 border border-white/10 text-blue-200/50">No findings yet</span>}
                          </div>
                        </button>

                        {expandedBranch === b.name && (
                          <div className="divide-y divide-white/5">
                            {b.plans.map((plan) => {
                              const st = planStatus(plan);
                              const ps = severities(plan.findings);
                              return (
                                <div key={plan.id}>
                                  <button
                                    onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
                                    className="w-full px-5 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-white/5 transition-colors text-left"
                                  >
                                    <div className="min-w-0">
                                      <h4 className="text-white font-medium">{plan.title}</h4>
                                      <p className="text-xs text-blue-200/40 mt-1">{plan.id === selectedPlanId ? "Currently selected — findings generated here" : ""}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-3">
                                      <span className={`px-2 py-0.5 text-xs rounded-full border ${st.cls}`}>{st.label}{st.pct !== null ? ` · ${st.pct}%` : ""}</span>
                                      <span className="text-xs text-blue-200/50">{plan.findings.length} find{plan.findings.length !== 1 ? "ings" : "ing"}</span>
                                      <svg className={`w-4 h-4 text-blue-400 transition-transform ${expandedPlan === plan.id ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                    </div>
                                  </button>

                                  {expandedPlan === plan.id && (
                                    <div className="px-5 pb-5">
                                      <div className="flex flex-wrap gap-2 mb-4">
                                        {SEVERITIES.map((sev) => (
                                          <span key={sev} className={`px-2 py-0.5 text-xs rounded-full border ${sevColor[sev]}`}>{sev}: {ps[sev]}</span>
                                        ))}
                                      </div>
                                      {plan.findings.length === 0 ? (
                                        <p className="text-sm text-blue-200/40">No findings generated for this audit. Select it above, write your notes, and generate.</p>
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
                                                      {f.department && <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200">{f.department}</span>}
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
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}