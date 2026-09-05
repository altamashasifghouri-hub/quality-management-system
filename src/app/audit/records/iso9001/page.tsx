"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

interface Finding { department: string; clause?: string; type: string; detail: string; recommendation?: string; evidence?: string[]; resolved?: boolean; }
interface Schedule { id: string; branch_id: string; branch_name?: string; date_from: string; date_to: string; departments: string[]; }
interface Plan { id: string; schedule_id: string; title: string; criteria: string; description: string | null; findings: Finding[]; }

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
    "10.1 Nonconformity and corrective action",
    "10.2 Continual improvement",
  ]},
];

const CLAUSE_ITEMS = ISO_CLAUSES.flatMap((c) => c.items);

const sevChip: Record<string, string> = {
  Critical: "bg-red-500/20 text-red-300",
  High: "bg-orange-500/20 text-orange-200",
  Medium: "bg-amber-500/20 text-amber-300",
  Low: "bg-blue-500/20 text-blue-300",
};

function severities(findings: Finding[]) {
  const s: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  findings.forEach((f) => { if (s[f.type] !== undefined) s[f.type] += 1; });
  return s;
}

export default function Iso9001Records() {
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
    setPlans((planData || []).map((p: any) => ({
      id: p.id, schedule_id: p.schedule_id, title: p.title, criteria: p.criteria || "ISO 9001:2015",
      description: p.description || null, findings: p.findings || [],
    })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || null;
  const selectedSched = selectedPlan ? schedules.find((s) => s.id === selectedPlan.schedule_id) : null;

  function onPlanChange(id: string) {
    setSelectedPlanId(id);
    setLastGenerate(null);
    setNotepadSaved(false);
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
    showMsg("Notes saved to the audit record.");
  }

  async function handleGenerate() {
    if (!selectedPlan) return;
    if (!notepad.trim()) return showErr("Write your audit notes in the notepad first.");
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
          branchName: selectedSched?.branch_name,
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
      setPlans((prev) => prev.map((p) => (p.id === selectedPlan.id ? { ...p, findings: merged } : p)));
      setLastGenerate({ count: merged.length, source: json.source || "generated" });
      showMsg(merged.length ? "Findings aligned to departments and ISO clauses and saved to Findings and Evidences." : "No findings were produced from these notes.");
    } catch (e: any) {
      showErr(e?.message || "Generation failed. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  const inputCls = "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark] w-full";
  const selectCls = "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark] w-full";
  const labelCls = "block text-sm text-blue-200/60 mb-1";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/audit/records" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to Audit Records
          </Link>
        </div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">ISO 9001 Audit Records</h1>
            <p className="text-blue-200/60">Write your findings in notes — the AI aligns them to departments and ISO clauses</p>
          </div>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-5">
              <h2 className="text-xl font-bold text-white">Record an ISO 9001 audit</h2>

              <div>
                <label className={labelCls}>Audit Plan *</label>
                <select value={selectedPlanId} onChange={(e) => onPlanChange(e.target.value)} className={selectCls}>
                  <option value="">Select an audit plan</option>
                  {plans.map((p) => {
                    const sched = schedules.find((s) => s.id === p.schedule_id);
                    return (
                      <option key={p.id} value={p.id} className="bg-slate-800">{sched?.branch_name || "Unassigned"} — {p.title} ({p.findings.length} find{p.findings.length !== 1 ? "ings" : "ing"})</option>
                    );
                  })}
                </select>
                {plans.length === 0 && <p className="text-xs text-amber-300/70 mt-1">No ISO 9001 audit plans yet. Create one from Audit Plan → ISO 9001 first.</p>}
              </div>

              {selectedPlan && (
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-blue-300 mb-3">Plan details — everything auto-fetched</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><span className="text-blue-200/50 block text-xs">Branch</span><span className="text-white">{selectedSched?.branch_name || "—"}</span></div>
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
                <div className="flex items-center justify-between mb-1">
                  <label className={labelCls}>Notepad — your raw audit findings</label>
                  {notepadSaved && <span className="text-xs text-green-300">✓ Saved</span>}
                </div>
                <textarea
                  value={notepad}
                  onChange={(e) => setNotepad(e.target.value)}
                  rows={10}
                  placeholder={"Write your audit points here as you go — one point per line.\nExample:\nKitchen cleaning schedules exist but temperature logs are not kept.\nWarehouse stock is properly labeled and rotated.\nTraining records for new hires are missing."}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
                <p className="text-xs text-blue-200/40 mt-1">Notes are saved to the audit record. Click Generate and the AI categorizes each point into a department and an ISO 9001 clause.</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button onClick={handleSaveNotes} disabled={saving || !selectedPlan} className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors disabled:opacity-40">
                  {saving ? "Saving..." : "Save Notes"}
                </button>
                <button onClick={handleGenerate} disabled={generating || !selectedPlan} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-40">
                  {generating ? "Aligning findings..." : "Generate Findings"}
                </button>
                <Link href="/audit/findings" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">→ See the Findings and Evidences section</Link>
              </div>

              {lastGenerate && (
                <div className="bg-blue-500/10 border border-blue-500/30 text-blue-200 text-sm rounded-lg px-4 py-3">
                  Saved {lastGenerate.count} finding{lastGenerate.count !== 1 ? "s" : ""} to the audit record, aligned by department and ISO clause. Open the Findings and Evidences section to review them.
                </div>
              )}
            </div>

            {selectedPlan && selectedPlan.findings.length > 0 && (
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-3">Aligned findings for this audit</h2>
                {(() => {
                  const s = severities(selectedPlan.findings);
                  return (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {Object.entries(s).map(([k, v]) => v > 0 && (
                        <span key={k} className={`px-2 py-0.5 text-xs rounded-full ${sevChip[k]}`}>{k}: {v}</span>
                      ))}
                    </div>
                  );
                })()}
                <div className="space-y-2">
                  {selectedPlan.findings.map((f, i) => (
                    <div key={i} className="p-3 bg-white/[0.03] border border-white/10 rounded-lg flex items-start gap-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${sevChip[f.type] || "bg-amber-500/20 text-amber-300"}`}>{f.type}</span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          {f.department && <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200">{f.department}</span>}
                          {f.clause && <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-200">Clause {f.clause}</span>}
                        </div>
                        <p className="text-sm text-white/80">{f.detail}</p>
                        {f.recommendation && <p className="text-xs text-blue-200/60 mt-1"><span className="text-blue-300">Recommendation:</span> {f.recommendation}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}