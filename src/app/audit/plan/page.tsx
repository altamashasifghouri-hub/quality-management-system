"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

interface AuditSchedule {
  id: string; branch_id: string; department_id: string;
  date_from: string; date_to: string; auditor: string;
  status: string; notes: string;
  branch_name?: string; dept_name?: string;
}

interface AuditPlan {
  id: string; schedule_id: string; title: string;
  description: string | null; status: string;
  checklist: { text: string; done: boolean }[];
  created_at: string;
}

export default function AuditPlanPage() {
  const supabase = createClient();
  const [schedules, setSchedules] = useState<AuditSchedule[]>([]);
  const [plans, setPlans] = useState<AuditPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedSchedule, setSelectedSchedule] = useState<string | null>(null);
  const [planTitle, setPlanTitle] = useState("");
  const [planDesc, setPlanDesc] = useState("");
  const [checklistItems, setChecklistItems] = useState<string[]>([""]);

  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editChecklist, setEditChecklist] = useState<{ text: string; done: boolean }[]>([]);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: s } = await supabase.from("audit_schedules").select("*, branches(name), departments(name)").order("date_from");
    const { data: p } = await supabase.from("audit_plans").select("*").order("created_at", { ascending: false });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSchedules((s || []).map((r: any) => ({
      id: r.id, branch_id: r.branch_id, department_id: r.department_id,
      date_from: r.date_from, date_to: r.date_to, auditor: r.auditor,
      status: r.status, notes: r.notes,
      branch_name: r.branches?.name || "", dept_name: r.departments?.name || "",
    })));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setPlans((p || []).map((r: any) => ({
      id: r.id, schedule_id: r.schedule_id, title: r.title,
      description: r.description, status: r.status,
      checklist: r.checklist || [], created_at: r.created_at,
    })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 3000); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 4000); }

  const scheduleMap = Object.fromEntries(schedules.map((s) => [s.id, s]));

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSchedule || !planTitle.trim()) return showErr("Select a schedule and enter a title.");
    const checklist = checklistItems.filter((t) => t.trim()).map((text) => ({ text: text.trim(), done: false }));
    setSaving(true);
    const { error } = await supabase.from("audit_plans").insert({
      schedule_id: selectedSchedule, title: planTitle.trim(), description: planDesc.trim() || null, checklist,
    });
    setSaving(false);
    if (error) return showErr(error.message);
    setPlanTitle(""); setPlanDesc(""); setChecklistItems([""]); setSelectedSchedule(null);
    showMsg("Plan created.");
    fetchData();
  }

  async function handleDeletePlan(id: string) {
    const { error } = await supabase.from("audit_plans").delete().eq("id", id);
    if (error) return showErr(error.message);
    showMsg("Plan deleted.");
    fetchData();
  }

  function startEdit(plan: AuditPlan) {
    setEditingPlan(plan.id);
    setEditTitle(plan.title);
    setEditDesc(plan.description || "");
    setEditChecklist(plan.checklist.length > 0 ? [...plan.checklist] : [{ text: "", done: false }]);
  }

  function updateEditChecklist(idx: number, field: "text" | "done", val: string | boolean) {
    setEditChecklist((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  }

  async function handleSaveEdit(id: string) {
    const checklist = editChecklist.filter((c) => c.text.trim());
    setSaving(true);
    const { error } = await supabase.from("audit_plans").update({
      title: editTitle.trim(), description: editDesc.trim() || null, checklist, status: checklist.every((c) => c.done) ? "Completed" : checklist.some((c) => c.done) ? "In Progress" : "Draft",
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    setSaving(false);
    if (error) return showErr(error.message);
    setEditingPlan(null);
    showMsg("Plan updated.");
    fetchData();
  }

  async function handleToggleCheck(planId: string, checklist: { text: string; done: boolean }[], idx: number) {
    const updated = checklist.map((c, i) => i === idx ? { ...c, done: !c.done } : c);
    await supabase.from("audit_plans").update({
      checklist: updated,
      status: updated.every((c) => c.done) ? "Completed" : updated.some((c) => c.done) ? "In Progress" : "Draft",
    }).eq("id", planId);
    fetchData();
  }

  const schedulesWithPlan = new Set(plans.map((p) => p.schedule_id));
  const availableSchedules = schedules.filter((s) => !schedulesWithPlan.has(s.id));

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
        <h1 className="text-3xl font-bold text-white mb-2">Audit Plan</h1>
        <p className="text-blue-200/60 mb-8">Select a schedule and create your audit plan</p>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-10">
          <h2 className="text-lg font-semibold text-white mb-4">Create New Plan</h2>
          <form onSubmit={handleCreatePlan}>
            <div className="mb-4">
              <label className="block text-sm text-blue-200/70 mb-1">Select Schedule</label>
              <select value={selectedSchedule || ""} onChange={(e) => setSelectedSchedule(e.target.value || null)} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]">
                <option value="" className="bg-slate-800">Choose a schedule...</option>
                {availableSchedules.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-800">{s.branch_name} — {s.dept_name} ({s.date_from} → {s.date_to})</option>
                ))}
              </select>
              {availableSchedules.length === 0 && <p className="text-xs text-blue-200/40 mt-1">All schedules have plans. Create new schedules first.</p>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-blue-200/70 mb-1">Plan Title</label>
                <input type="text" value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} placeholder="e.g. Kitchen Hygiene Audit Plan" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm text-blue-200/70 mb-1">Description (optional)</label>
                <input type="text" value={planDesc} onChange={(e) => setPlanDesc(e.target.value)} placeholder="Brief description" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm text-blue-200/70 mb-2">Checklist Items</label>
              {checklistItems.map((item, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input type="text" value={item} onChange={(e) => { const copy = [...checklistItems]; copy[i] = e.target.value; setChecklistItems(copy); }} placeholder={`Item ${i + 1}`} className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {checklistItems.length > 1 && (
                    <button type="button" onClick={() => setChecklistItems(checklistItems.filter((_, j) => j !== i))} className="px-3 py-2 text-red-400 hover:text-red-300 text-sm transition-colors">✕</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setChecklistItems([...checklistItems, ""])} className="text-sm text-blue-400 hover:text-blue-300 transition-colors">+ Add item</button>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={saving} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition-all duration-200 shadow-lg shadow-blue-600/25">
                {saving ? "Creating..." : "Create Plan"}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Existing Plans</h2>
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : plans.length === 0 ? (
            <p className="text-blue-200/40 text-center py-8">No plans created yet.</p>
          ) : (
            <div className="space-y-4">
              {plans.map((plan) => {
                const sched = scheduleMap[plan.schedule_id];
                return (
                  <div key={plan.id} className="bg-white/5 rounded-xl border border-white/5 overflow-hidden">
                    {editingPlan === plan.id ? (
                      <div className="p-5">
                        <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full px-3 py-2 bg-white/10 border border-blue-500 rounded-lg text-white text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder="Description" className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-white text-sm mb-3 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <div className="space-y-2 mb-3">
                          {editChecklist.map((c, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input type="text" value={c.text} onChange={(e) => updateEditChecklist(i, "text", e.target.value)} className="flex-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                              <button type="button" onClick={() => setEditChecklist(editChecklist.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                            </div>
                          ))}
                          <button type="button" onClick={() => setEditChecklist([...editChecklist, { text: "", done: false }])} className="text-xs text-blue-400 hover:text-blue-300">+ Add item</button>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleSaveEdit(plan.id)} disabled={saving} className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors">{saving ? "Saving..." : "Save"}</button>
                          <button onClick={() => setEditingPlan(null)} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="text-white font-semibold">{plan.title}</h3>
                            {sched && <p className="text-xs text-blue-200/50">{sched.branch_name} — {sched.dept_name} ({sched.date_from} → {sched.date_to})</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-xs rounded-full ${plan.status === "Completed" ? "bg-green-500/20 text-green-300" : plan.status === "In Progress" ? "bg-amber-500/20 text-amber-300" : "bg-white/10 text-white/60"}`}>{plan.status}</span>
                            <button onClick={() => startEdit(plan)} className="text-xs text-blue-300 hover:text-white transition-colors">Edit</button>
                            <button onClick={() => { if (confirm("Delete this plan?")) handleDeletePlan(plan.id); }} className="text-xs text-red-400 hover:text-red-300 transition-colors">Delete</button>
                          </div>
                        </div>
                        {plan.description && <p className="text-sm text-blue-200/50 mb-3">{plan.description}</p>}
                        {plan.checklist.length > 0 && (
                          <div className="space-y-1.5">
                            {plan.checklist.map((item, i) => (
                              <label key={i} className="flex items-center gap-2 cursor-pointer group">
                                <input type="checkbox" checked={item.done} onChange={() => handleToggleCheck(plan.id, plan.checklist, i)} className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500" />
                                <span className={`text-sm transition-colors ${item.done ? "text-blue-200/40 line-through" : "text-white/80"}`}>{item.text}</span>
                              </label>
                            ))}
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
      </main>
    </div>
  );
}
