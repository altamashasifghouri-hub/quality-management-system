"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

interface Finding { department: string; type: string; detail: string; recommendation?: string; evidence?: string[]; resolved?: boolean; policy?: string; policyClause?: string; sop?: string; sopClause?: string; }
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
  audit_team: string | null;
  number_of_employees: number | null;
  period_covered: string | null;
  locations_covered: string | null;
  exclusions: string | null;
  approach: string[];
  program: { department: string; duration: string }[];
  signature: string | null;
  status: string;
}
interface Session {
  id: string;
  plan_id: string;
  notepad: string;
  status: string;
  policy_text: string;
  policy_file: string;
  policy_file_url: string;
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
  const [cloning, setCloning] = useState<string | null>(null);
  const [lastGenerate, setLastGenerate] = useState<{ count: number; source: string } | null>(null);

  const [policyText, setPolicyText] = useState("");
  const [policyFileName, setPolicyFileName] = useState("");
  const [policyChars, setPolicyChars] = useState(0);
  const [policyExtracting, setPolicyExtracting] = useState(false);
  const [policyDriveUrl, setPolicyDriveUrl] = useState("");
  const [savingToDrive, setSavingToDrive] = useState(false);
  const policyFileRef = useRef<File | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 4000); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 5000); }
  function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  function genDocNumber(branchName: string, count: number) {
    const code = (branchName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase() || "QMS");
    return `QMS/IA/${new Date().getFullYear()}/${code}-${String(count + 1).padStart(3, "0")}`;
  }

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
      audit_team: p.audit_team || null, number_of_employees: p.number_of_employees ?? null,
      period_covered: p.period_covered || null, locations_covered: p.locations_covered || null, exclusions: p.exclusions || null,
      approach: p.approach || [], program: p.program || [], signature: p.signature || null,
      status: p.status || "Draft",
    })));
    if (sessionData) {
      setSession({
        id: sessionData.id as string,
        plan_id: sessionData.plan_id as string,
        notepad: sessionData.notepad || "",
        status: sessionData.status,
        policy_text: sessionData.policy_text || "",
        policy_file: sessionData.policy_file || "",
        policy_file_url: sessionData.policy_file_url || "",
      });
      setNotepad(sessionData.notepad || "");
      setPolicyText(sessionData.policy_text || "");
      setPolicyFileName(sessionData.policy_file || "");
      setPolicyDriveUrl(sessionData.policy_file_url || "");
      setPolicyChars((sessionData.policy_text || "").length || 0);
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

  async function openSession(pid: string, successMsg?: string) {
    setStarting(true);
    setError("");
    try {
      if (session && session.plan_id === pid) {
        setSession({ ...session, plan_id: pid });
        setNotepad(session.notepad || "");
        showMsg("Audit resumed.");
        setStarting(false);
        return;
      }
      if (session) {
        await supabase.from("audit_sessions").update({ status: "closed", closed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", session.id);
      }
      const { data: existing } = await supabase
        .from("audit_sessions").select("id, notepad, policy_text, policy_file, policy_file_url").eq("plan_id", pid)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      let sessId: string;
      let resumeNotepad = "";
      let resumePolicy = { text: "", file: "", url: "" };
      if (existing) {
        sessId = existing.id as string;
        const { error: err2 } = await supabase
          .from("audit_sessions")
          .update({ status: "active", started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", sessId);
        if (err2) return showErr(err2.message);
        resumeNotepad = (existing as any).notepad || "";
        resumePolicy = {
          text: (existing as any).policy_text || "",
          file: (existing as any).policy_file || "",
          url: (existing as any).policy_file_url || "",
        };
      } else {
        const { data, error: err2 } = await supabase
          .from("audit_sessions").insert({ plan_id: pid, notepad: "", status: "active", policy_text: "", policy_file: "", policy_file_url: "" }).select("id").single();
        if (err2) return showErr(err2.message);
        sessId = data?.id as string;
      }
      setSession({ id: sessId, plan_id: pid, notepad: resumeNotepad, status: "active", policy_text: resumePolicy.text, policy_file: resumePolicy.file, policy_file_url: resumePolicy.url });
      setNotepad(resumeNotepad);
      setPolicyText(resumePolicy.text); setPolicyFileName(resumePolicy.file); setPolicyChars(resumePolicy.text.trim().length); setPolicyDriveUrl(resumePolicy.url);
      setSelectedPlanId("");
      if (successMsg) showMsg(successMsg);
      setStarting(false);
    } catch (e: any) {
      setStarting(false);
      showErr(e?.message || "Could not start audit.");
    }
  }

  async function handleStartAudit() {
    if (!selectedPlan) return;
    await openSession(selectedPlan.id, "Audit started. Everything you write here is auto-saved — close it only when you are done.");
  }

  async function startNextAudit(plan: AuditPlan) {
    if (!plan.schedule_id) return;
    if (!confirm(`Create the next audit for ${plan.branch_name || "this branch"} on the same "${planScheduleSummary(plan) || "dates"}" schedule and open it for recording?`)) return;
    setCloning(plan.id);
    setError("");
    try {
      const round = plans.filter((p) => p.schedule_id === plan.schedule_id).length + 1;
      const nextDoc = plan.branch_name ? genDocNumber(plan.branch_name, plans.length) : null;
      const { data, error: insErr } = await supabase.from("internal_audits").insert({
        title: `${plan.title} (Round ${round})`,
        document_number: nextDoc,
        branch_id: plan.branch_id, schedule_id: plan.schedule_id,
        departments: plan.departments, audit_team: plan.audit_team,
        audit_period: plan.audit_period, plan_version: plan.plan_version,
        prepared_by: plan.prepared_by, date_of_plan: todayStr(),
        number_of_employees: plan.number_of_employees, purpose: plan.purpose,
        period_covered: plan.period_covered, locations_covered: plan.locations_covered,
        exclusions: plan.exclusions, approach: plan.approach, program: plan.program,
        signature: plan.signature, findings: [], status: "Draft",
      }).select("id").single();
      if (insErr) return showErr(insErr.message);
      const newId = (data?.id as string) || "";
      setPlans((prev) => [{
        ...plan, id: newId, title: `${plan.title} (Round ${round})`,
        findings: [], date_of_plan: todayStr(), document_number: nextDoc, status: "Draft",
      }, ...prev]);
      await openSession(newId, `Next audit created (Round ${round}) and opened. Write your notes, then click Generate Findings.`);
    } catch (e: any) {
      showErr(e?.message || "Could not create the next audit.");
    } finally {
      setCloning(null);
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
    if (session.policy_text !== policyText) {
      await supabase.from("audit_sessions").update({ policy_text: policyText, policy_file: policyFileName, policy_file_url: policyDriveUrl, updated_at: new Date().toISOString() }).eq("id", session.id).then(({ error }) => { if (error) showErr(error.message); });
    }
    const { error: err } = await supabase.from("audit_sessions").update({ status: "closed", closed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", session.id);
    setClosing(false);
    if (err) return showErr(err.message);
    setSession(null); setNotepad(""); setSelectedPlanId("");
    setPolicyText(""); setPolicyFileName(""); setPolicyChars(0); setPolicyDriveUrl("");
    showMsg("Audit closed.");
    fetchData();
  }

  async function handlePolicyFile(file: File | null) {
    if (!session) return;
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return showErr("Policy file must be 4MB or smaller.");
    const ext = (file.name.toLowerCase().match(/\.[a-z0-9]+$/i) || [])[0] || "";
    if (![".txt", ".md", ".csv", ".docx", ".pdf"].includes(ext)) return showErr("Supported formats: TXT, DOCX, PDF.");
    policyFileRef.current = file;
    setPolicyExtracting(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/policy-extract", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return showErr(`${json?.error || "Could not read the file."}${json?.detail ? ` (${String(json.detail).slice(0, 160)})` : ""}`);
      let driveUrl: string | null = null;
      try {
        const dfd = new FormData();
        dfd.append("file", file);
        dfd.append("folderKind", "policies");
        const dr = await fetch("/api/drive-upload", { method: "POST", body: dfd });
        const djson = await dr.json().catch(() => ({}));
        if (dr.ok) driveUrl = djson.url || null;
        else showErr(`Saved the text but could not save the file to Google Drive: ${djson?.error || "Drive not connected"}`);
      } catch {
        showErr("Saved the text but could not save the file to Google Drive.");
      }
      setPolicyText(json.text || "");
      setPolicyFileName(json.fileName || file.name);
      setPolicyChars(json.charCount || 0);
      setPolicyDriveUrl(driveUrl || "");
      const { error: err } = await supabase.from("audit_sessions").update({ policy_text: json.text || "", policy_file: json.fileName || file.name, policy_file_url: driveUrl, updated_at: new Date().toISOString() }).eq("id", session.id);
      if (err) showErr(err.message);
      showMsg("Policy loaded — the AI extracted its text and the file is saved in Google Drive. Findings will name the violated policy + section.");
    } catch (e: any) {
      showErr(e?.message || "Could not read the file.");
    } finally {
      setPolicyExtracting(false);
    }
  }

  async function handleClearPolicy() {
    if (!session) return;
    policyFileRef.current = null;
    setPolicyText(""); setPolicyFileName(""); setPolicyChars(0); setPolicyDriveUrl("");
    await supabase.from("audit_sessions").update({ policy_text: "", policy_file: "", policy_file_url: "", updated_at: new Date().toISOString() }).eq("id", session.id);
    showMsg("Policy reference removed.");
  }

  async function handleSavePolicyToDrive() {
    if (!session || !policyFileRef.current) return;
    setSavingToDrive(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", policyFileRef.current);
      fd.append("folderKind", "policies");
      const res = await fetch("/api/drive-upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return showErr(json?.error || "Upload to Google Drive failed.");
      setPolicyDriveUrl(json.url || "");
      showMsg("Policy document saved to Google Drive.");
    } catch (e: any) {
      showErr(e?.message || "Upload to Google Drive failed.");
    } finally {
      setSavingToDrive(false);
    }
  }

  async function handleGenerate(replace = false) {
    if (!session || !sessionPlan) return;
    if (!notepad.trim()) return showErr("Write your audit notes in the notepad first.");
    if (replace && sessionPlan.findings.length && !confirm(`Replace the current ${sessionPlan.findings.length} finding(s) with newly generated ones?`)) return;
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
          policyText,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return showErr(json?.error || "Generation failed. Try again.");
      const incoming: Finding[] = json.findings || [];
      const current: Finding[] = replace ? [] : (sessionPlan.findings || []);
      const existingKey = new Set(current.map((f) => `${(f.department || "").toLowerCase()}|${(f.detail || "").trim().toLowerCase()}`));
      const merged = [...current];
      incoming.forEach((f) => {
        const key = `${(f.department || "").toLowerCase()}|${(f.detail || "").trim().toLowerCase()}`;
        if (!existingKey.has(key)) {
          merged.push({
            department: f.department,
            type: f.type,
            detail: f.detail,
            recommendation: f.recommendation,
            evidence: [],
            resolved: false,
            policy: f.policy,
            policyClause: f.policyClause,
            sop: f.sop,
            sopClause: f.sopClause,
          });
          existingKey.add(key);
        } else {
          const idx = merged.findIndex((m) => `${(m.department || "").toLowerCase()}|${(m.detail || "").trim().toLowerCase()}` === key);
          if (idx >= 0 && !merged[idx].policy && f.policy) {
            merged[idx] = { ...merged[idx], policy: f.policy, policyClause: f.policyClause };
          }
          if (idx >= 0 && !merged[idx].sop && f.sop) {
            merged[idx] = { ...merged[idx], sop: f.sop, sopClause: f.sopClause };
          }
        }
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950">
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
            <div className="bg-gradient-to-br from-purple-500/10 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-purple-500/30 rounded-2xl p-6">
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

            <div className="bg-gradient-to-br from-emerald-500/10 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-emerald-500/30 rounded-2xl p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Policy reference (optional)</h2>
                  <p className="text-xs text-blue-200/40 mt-1">Upload your HR / company policy document (PDF, DOCX or TXT). Findings will be matched against it to name the violated policy and section.</p>
                </div>
                {policyFileName && (
                  <button onClick={handleClearPolicy} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-colors">Remove</button>
                )}
              </div>

              {policyFileName ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-emerald-300 font-medium truncate flex items-center gap-2">
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                        {policyFileName}
                      </p>
                      <p className="text-xs text-emerald-300/60 mt-1">{policyChars.toLocaleString()} characters loaded · used for the next Generate Findings</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!policyDriveUrl && (
                        <button onClick={handleSavePolicyToDrive} disabled={savingToDrive} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors disabled:opacity-50">
                          {savingToDrive ? "Saving..." : "Save a copy to Google Drive"}
                        </button>
                      )}
                      <label className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium cursor-pointer transition-colors">
                        Replace
                        <input type="file" accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={(e) => handlePolicyFile(e.target.files?.[0] || null)} />
                      </label>
                    </div>
                  </div>
                  {policyDriveUrl && (
                    <a href={policyDriveUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-300 underline mt-3 inline-block">✓ Saved to Google Drive — open file</a>
                  )}
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 cursor-pointer border border-dashed border-emerald-500/40 rounded-xl p-8 hover:bg-emerald-500/5 transition-colors">
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.md,.csv"
                    className="hidden"
                    disabled={policyExtracting}
                    onChange={(e) => handlePolicyFile(e.target.files?.[0] || null)}
                  />
                  <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                  <span className="text-sm text-emerald-200/80">{policyExtracting ? "Reading document..." : "Click to upload the policy document"}</span>
                  <span className="text-xs text-blue-200/40">PDF · DOCX · TXT — up to 4MB</span>
                </label>
              )}
            </div>

            <div className="bg-gradient-to-br from-blue-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-blue-400/20 rounded-2xl p-6">
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
              <button onClick={() => handleGenerate(false)} disabled={generating} className="px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {generating ? "Generating..." : "Generate Findings"}
              </button>
              {sessionPlan.findings.length > 0 && (
                <button onClick={() => handleGenerate(true)} disabled={generating} className="px-5 py-2.5 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                  {generating ? "Working..." : `Regenerate — replace all findings (${sessionPlan.findings.length})`}
                </button>
              )}
              <Link href="/audit/findings" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">→ See the Findings section</Link>
            </div>
            {lastGenerate && (
              <div className="bg-purple-500/10 border border-purple-500/30 text-purple-200 text-sm rounded-lg px-4 py-3">
                Saved {lastGenerate.count} finding{lastGenerate.count !== 1 ? "s" : ""} to the audit plan. Open the Findings section to review them.
              </div>
            )}
          </div>
        ) : (
          <>
          <div className="bg-gradient-to-br from-blue-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-blue-400/20 rounded-2xl p-6 space-y-5">
            <h2 className="text-xl font-bold text-white">Start an Audit</h2>

            <div>
                <label className={labelCls}>Audit Plan *</label>
                <select value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)} className={selectCls}>
                  <option value="">Select an audit plan</option>
{plans.map((p) => (
                      <option key={p.id} value={p.id} className="bg-slate-800">{p.branch_name} - {p.title}{planScheduleSummary(p) ? ` (${planScheduleSummary(p)})` : ""}</option>
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

          {plans.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-bold text-white mb-1">Audit rounds</h2>
              <p className="text-sm text-blue-200/50 mb-4">A round is counted once its findings are saved. Recorded rounds unlock the next one on the same schedule dates.</p>
              <div className="space-y-3">
                {plans.map((plan) => {
                  const recorded = plan.findings.length > 0;
                  const runnable = recorded && !!plan.schedule_id;
                  const when = planScheduleSummary(plan);
                  return (
                    <div key={plan.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-semibold text-white">{plan.title}</h3>
                          <span className="text-xs text-blue-300 bg-blue-500/20 px-2 py-0.5 rounded-full">{plan.branch_name || "—"}</span>
                          {when && <span className="text-xs text-blue-200/70 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">{when}</span>}
                          {recorded && <span className="text-xs text-green-300 bg-green-500/20 px-2 py-0.5 rounded-full">Recorded</span>}
                        </div>
                        <p className="text-xs text-blue-200/40 mt-1">
                          {plan.document_number && <span>{plan.document_number} · </span>}
                          {plan.findings.length} finding{plan.findings.length !== 1 ? "s" : ""} recorded
                        </p>
                      </div>
                      {runnable ? (
                        <div className="text-right">
                          <button onClick={() => startNextAudit(plan)} disabled={cloning === plan.id} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                            {cloning === plan.id ? "Creating..." : "Generate findings for next round"}
                          </button>
                          <p className="text-xs text-blue-200/40 mt-1">Creates the next audit on the same dates and opens recording.</p>
                        </div>
                      ) : (
                        <span className="text-xs text-blue-200/40">{recorded ? "No schedule linked — add one to run again." : "Record this audit first to unlock the next round."}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </>
        )}
      </main>
    </div>
  );
}