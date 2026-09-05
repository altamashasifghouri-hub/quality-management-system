"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

interface Finding { department: string; type: string; detail: string; recommendation?: string; evidence?: string[]; resolved?: boolean; }
interface Branch { id: string; name: string; }
interface Schedule { id: string; branch_id: string; date_from: string; date_to: string; departments: string[]; }
interface AuditPlan {
  id: string;
  title: string;
  branch_id: string;
  branch_name?: string;
  schedule_id: string | null;
  departments: string[];
  findings: Finding[];
  audit_period: string | null;
  plan_version: string | null;
  prepared_by: string | null;
  date_of_plan: string | null;
  purpose: string | null;
  document_number: string | null;
}
interface Session {
  id: string;
  plan_id: string;
  notepad: string;
  status: string;
}

export default function InternalRecords() {
  const supabase = createClient();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [plans, setPlans] = useState<AuditPlan[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [selectedPlanId, setSelectedPlanId] = useState("");

  const [notepad, setNotepad] = useState("");
  const [notepadSaved, setNotepadSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [lastGenerate, setLastGenerate] = useState<{ count: number; source: string } | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 4000); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 5000); }
  function todayStr() { return new Date().toISOString().slice(0, 10); }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: branchData }, { data: schedData }, { data: planData }, { data: sessionData }] = await Promise.all([
      supabase.from("branches").select("*").order("created_at", { ascending: true }),
      supabase.from("audit_schedules").select("*").order("date_from", { ascending: true }),
      supabase.from("internal_audits").select("*").order("created_at", { ascending: false }),
      supabase.from("audit_sessions").select("*").eq("status", "active").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const branchName = new Map<string, string>();
    const br = (branchData || []).map((b: any) => { branchName.set(b.id, b.name); return { id: b.id, name: b.name }; });
    setBranches(br);
    setSchedules((schedData || []).map((s: any) => ({ id: s.id, branch_id: s.branch_id, date_from: s.date_from, date_to: s.date_to, departments: s.departments || [] })));
    setPlans((planData || []).map((p: any) => ({
      id: p.id, title: p.title, branch_id: p.branch_id, branch_name: branchName.get(p.branch_id) || "",
      schedule_id: p.schedule_id, departments: p.departments || [], findings: p.findings || [],
      audit_period: p.audit_period, plan_version: p.plan_version, prepared_by: p.prepared_by,
      date_of_plan: p.date_of_plan, purpose: p.purpose, document_number: p.document_number,
    })));
    if (sessionData) {
      setSession({ id: sessionData.id as string, plan_id: sessionData.plan_id as string, notepad: sessionData.notepad || "", status: sessionData.status });
      setNotepad(sessionData.notepad || "");
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sessionPlan = session ? plans.find((p) => p.id === session.plan_id) || null : null;
  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || null;

  function planScheduleSummary(plan: AuditPlan) {
    const s = schedules.find((sc) => sc.id === plan.schedule_id);
    return s ? `${s.date_from} → ${s.date_to}` : plan.audit_period || "";
  }

  async function handleStartAudit() {
    if (!selectedPlan) return;
    setStarting(true);
    setError("");
    try {
      if (session && session.plan_id === selectedPlan.id) {
        setSession({ ...session, plan_id: selectedPlan.id });
        setNotepad(session.notepad || "");
        showMsg("Audit resumed.");
        setStarting(false);
        return;
      }
      if (session) {
        await supabase.from("audit_sessions").update({ status: "closed", closed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", session.id);
      }
      const { data: existing } = await supabase
        .from("audit_sessions").select("id").eq("plan_id", selectedPlan.id)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      let sessId: string;
      if (existing) {
        sessId = existing.id as string;
        const { error: err2 } = await supabase
          .from("audit_sessions")
          .update({ status: "active", notepad: "", closed_at: null, started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", sessId);
        if (err2) return showErr(err2.message);
      } else {
        const { data, error: err2 } = await supabase
          .from("audit_sessions").insert({ plan_id: selectedPlan.id, notepad: "", status: "active" }).select("id").single();
        if (err2) return showErr(err2.message);
        sessId = data?.id as string;
      }
      setSession({ id: sessId, plan_id: selectedPlan.id, notepad: "", status: "active" });
      setNotepad("");
      setSelectedPlanId("");
      showMsg("Audit started. Everything you write here is auto-saved — close it only when you are done.");
      setStarting(false);
    } catch (e: any) {
      setStarting(false);
      showErr(e?.message || "Could not start audit.");
    }
  }

  const persistNotepad = useCallback(async (text: string) => {
    if (!session) return;
    const { error: err } = await supabase.from("audit_sessions").update({ notepad: text, updated_at: new Date().toISOString() }).eq("id", session.id);
    if (err) return;
  }, [supabase, session]);

  useEffect(() => {
    if (!session) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persistNotepad(notepad).then(() => {
        setNotepadSaved(true);
        setTimeout(() => setNotepadSaved(false), 2500);
      });
    }, 900);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [notepad, session, persistNotepad]);

  async function handleSaveNotepad() {
    if (!session) return;
    setSaving(true);
    const { error: err } = await supabase.from("audit_sessions").update({ notepad, updated_at: new Date().toISOString() }).eq("id", session.id);
    setSaving(false);
    if (err) return showErr(err.message);
    showMsg("Notepad saved.");
  }

  async function handleCloseAudit() {
    if (!session) return;
    if (!confirm("Close this audit session? This ends the recording — you can start a new one anytime.")) return;
    setClosing(true);
    await persistNotepad(notepad);
    const { error: err } = await supabase.from("audit_sessions").update({ status: "closed", closed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", session.id);
    setClosing(false);
    if (err) return showErr(err.message);
    setSession(null); setNotepad(""); setSelectedPlanId("");
    showMsg("Audit closed.");
    fetchData();
  }

  async function handleGenerate() {
    if (!session || !sessionPlan) return;
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
          departments: sessionPlan.departments,
          branchName: sessionPlan.branch_name,
          planTitle: sessionPlan.title,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return showErr(json?.error || "Generation failed. Try again.");
      const incoming: Finding[] = json.findings || [];
      const current: Finding[] = sessionPlan.findings || [];
      const existingKey = new Set(current.map((f) => `${f.department.toLowerCase()}|${f.detail.trim().toLowerCase()}`));
      const merged = [...current];
      incoming.forEach((f) => {
        const key = `${f.department.toLowerCase()}|${f.detail.trim().toLowerCase()}`;
        if (!existingKey.has(key)) { merged.push({ department: f.department, type: f.type, detail: f.detail, recommendation: f.recommendation, evidence: [], resolved: false }); existingKey.add(key); }
      });
      const { error: updErr } = await supabase.from("internal_audits").update({ findings: merged, updated_at: new Date().toISOString() }).eq("id", sessionPlan.id);
      if (updErr) return showErr(updErr.message);
      setPlans((prev) => prev.map((p) => (p.id === sessionPlan.id ? { ...p, findings: merged } : p)));
      setLastGenerate({ count: merged.length, source: json.source || "generated" });
      showMsg(merged.length ? `Findings generated and saved to the Findings section.` : "No findings were produced from these notes.");
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

        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Internal Audit Records</h1>
            <p className="text-blue-200/60">Select an audit plan, take notes in the notepad, and generate findings</p>
          </div>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : session && sessionPlan ? (
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-sm border border-purple-500/30 rounded-2xl p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <h2 className="text-lg font-semibold text-white">Audit in progress</h2>
                  </div>
                  <p className="text-xs text-blue-200/40 mt-1">Auto-saved. It stays open even if you refresh, log out, or close the tab — close it when you are done.</p>
                </div>
                <button onClick={handleCloseAudit} disabled={closing} className="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
                  {closing ? "Closing..." : "Close Audit"}
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-blue-200/50 block text-xs">Branch</span><span className="text-white font-medium">{sessionPlan.branch_name || "—"}</span></div>
                <div><span className="text-blue-200/50 block text-xs">Audit Plan</span><span className="text-white font-medium">{sessionPlan.title}</span></div>
                <div><span className="text-blue-200/50 block text-xs">Document No.</span><span className="text-white font-medium">{sessionPlan.document_number || "—"}</span></div>
                <div><span className="text-blue-200/50 block text-xs">Audit Dates</span><span className="text-white font-medium">{planScheduleSummary(sessionPlan) || "—"}</span></div>
                <div><span className="text-blue-200/50 block text-xs">Prepared by</span><span className="text-white font-medium">{sessionPlan.prepared_by || "—"}</span></div>
                <div><span className="text-blue-200/50 block text-xs">Version</span><span className="text-white font-medium">{sessionPlan.plan_version || "—"}</span></div>
                <div className="col-span-2"><span className="text-blue-200/50 block text-xs">Started</span><span className="text-white font-medium">{session.notepad ? "Recording notes" : "Ready for notes"}</span></div>
              </div>

              <div className="mt-4">
                <span className="text-sm text-blue-200/60">Departments in this audit</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {sessionPlan.departments.map((d) => (
                    <span key={d} className="px-3 py-1 text-xs rounded-full bg-purple-600/30 border border-purple-500/40 text-white">{d}</span>
                  ))}
                  {sessionPlan.departments.length === 0 && <span className="text-xs text-blue-200/40">No departments on this plan.</span>}
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-white">Notepad</h2>
                {notepadSaved ? (
                  <span className="text-xs text-green-300">✓ Saved</span>
                ) : (
                  <button onClick={handleSaveNotepad} disabled={saving} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm disabled:opacity-50">
                    {saving ? "Saving..." : "Save"}
                  </button>
                )}
              </div>
              <textarea
                value={notepad}
                onChange={(e) => setNotepad(e.target.value)}
                rows={10}
                placeholder={"Write your audit points here as you go.\nOne point per line. Save automatically or with the Save button. Then click Generate Findings."}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button onClick={handleGenerate} disabled={generating} className="px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {generating ? "Generating..." : "Generate Findings"}
              </button>
              <Link href="/audit/findings" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">→ See the Findings section</Link>
            </div>
            {lastGenerate && (
              <div className="bg-purple-500/10 border border-purple-500/30 text-purple-200 text-sm rounded-lg px-4 py-3">
                Saved {lastGenerate.count} finding{lastGenerate.count !== 1 ? "s" : ""} to the audit plan. Open the Findings section to review them.
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 space-y-5">
            <h2 className="text-xl font-bold text-white">Start an Audit</h2>

            <div>
                <label className={labelCls}>Audit Plan *</label>
                <select value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)} className={selectCls}>
                  <option value="">Select an audit plan</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-800">{p.branch_name} — {p.title}</option>
                  ))}
                </select>
                <p className="text-xs text-blue-200/40 mt-1">The branch, dates and departments are fetched automatically from the plan.</p>
              </div>

            {selectedPlan && (
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-purple-300 mb-3">Plan details — everything auto-fetched</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><span className="text-blue-200/50 block text-xs">Branch</span><span className="text-white">{selectedPlan.branch_name || "—"}</span></div>
                  <div><span className="text-blue-200/50 block text-xs">Audit Title</span><span className="text-white">{selectedPlan.title}</span></div>
                  <div><span className="text-blue-200/50 block text-xs">Document No.</span><span className="text-white">{selectedPlan.document_number || "—"}</span></div>
                  <div><span className="text-blue-200/50 block text-xs">Audit Dates</span><span className="text-white">{planScheduleSummary(selectedPlan) || "—"}</span></div>
                  <div><span className="text-blue-200/50 block text-xs">Prepared by</span><span className="text-white">{selectedPlan.prepared_by || "—"}</span></div>
                  <div><span className="text-blue-200/50 block text-xs">Plan Version</span><span className="text-white">{selectedPlan.plan_version || "—"}</span></div>
                  <div><span className="text-blue-200/50 block text-xs">Date of Plan</span><span className="text-white">{selectedPlan.date_of_plan || todayStr()}</span></div>
                </div>
                <div className="mt-3">
                  <span className="text-sm text-blue-200/60">Departments in this audit</span>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedPlan.departments.map((d) => (
                      <span key={d} className="px-3 py-1 text-xs rounded-full bg-purple-600/30 border border-purple-500/40 text-white">{d}</span>
                    ))}
                    {selectedPlan.departments.length === 0 && <span className="text-xs text-amber-300/70">This plan has no departments selected. Add departments when creating the plan.</span>}
                  </div>
                </div>
                {selectedPlan.purpose && <p className="text-sm text-blue-200/50 mt-3">{selectedPlan.purpose}</p>}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={handleStartAudit} disabled={!selectedPlan || starting} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                {starting ? "Starting..." : "Start Audit"}
              </button>
              {!selectedPlan && <p className="text-xs text-blue-200/40 self-center">Select an audit plan to start.</p>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}