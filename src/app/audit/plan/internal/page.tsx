"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

interface Department { id: string; name: string; branch_id: string; }
interface Branch { id: string; name: string; departments: Department[]; }

interface Finding { department: string; type: "Observation" | "Nonconformity" | "Opportunity"; detail: string; }

interface InternalAudit {
  id: string;
  title: string;
  branch_id: string;
  branch_name?: string;
  departments: string[];
  audit_team: string | null;
  findings: Finding[];
  status: string;
  created_at: string;
}

const typeBadge = (type: string) =>
  type === "Nonconformity"
    ? "bg-red-500/20 text-red-300"
    : type === "Opportunity"
    ? "bg-blue-500/20 text-blue-300"
    : "bg-amber-500/20 text-amber-300";

const statusBadge = (status: string) =>
  status === "Completed"
    ? "bg-green-500/20 text-green-300"
    : status === "In Progress"
    ? "bg-amber-500/20 text-amber-300"
    : "bg-white/10 text-blue-200/70";

export default function InternalAuditPlan() {
  const supabase = createClient();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [plans, setPlans] = useState<InternalAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [planTitle, setPlanTitle] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [planTeam, setPlanTeam] = useState("");

  const [viewingPlan, setViewingPlan] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTeam, setEditTeam] = useState("");
  const [editBranch, setEditBranch] = useState("");
  const [editDepts, setEditDepts] = useState<string[]>([]);

  const [findingDept, setFindingDept] = useState("");
  const [findingType, setFindingType] = useState<Finding["type"]>("Observation");
  const [findingDetail, setFindingDetail] = useState("");
  const [showFindingForm, setShowFindingForm] = useState(false);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 3000); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 4000); }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: branchData } = await supabase.from("branches").select("*").order("created_at", { ascending: true });
    const { data: deptData } = await supabase.from("departments").select("*").order("created_at", { ascending: true });
    const { data: planData } = await supabase.from("internal_audits").select("*").order("created_at", { ascending: false });

    const deptMap = new Map<string, Department[]>();
    (deptData || []).forEach((d: any) => {
      const list = deptMap.get(d.branch_id) || [];
      list.push({ id: d.id, name: d.name, branch_id: d.branch_id });
      deptMap.set(d.branch_id, list);
    });
    const br = (branchData || []).map((b: any) => ({ id: b.id, name: b.name, departments: deptMap.get(b.id) || [] }));
    const branchName = new Map(br.map((b) => [b.id, b.name]));
    setBranches(br);
    setPlans((planData || []).map((p: any) => ({
      id: p.id, title: p.title, branch_id: p.branch_id,
      branch_name: branchName.get(p.branch_id) || "",
      departments: p.departments || [], audit_team: p.audit_team,
      findings: p.findings || [], status: p.status || "Draft", created_at: p.created_at,
    })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selBranch = branches.find((b) => b.id === selectedBranch);
  const editSelBranch = branches.find((b) => b.id === editBranch);

  function toggleDept(dept: string) {
    setSelectedDepts((prev) => prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]);
  }
  function toggleEditDept(dept: string) {
    setEditDepts((prev) => prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!planTitle.trim() || !selectedBranch) return showErr("Enter a title and select a branch.");
    if (selectedDepts.length === 0) return showErr("Select at least one department.");
    setSaving(true);
    const { error: err } = await supabase.from("internal_audits").insert({
      title: planTitle.trim(), branch_id: selectedBranch,
      departments: selectedDepts, audit_team: planTeam.trim() || null,
      findings: [], status: "Draft",
    });
    setSaving(false);
    if (err) return showErr(err.message);
    setPlanTitle(""); setSelectedBranch(""); setSelectedDepts([]); setPlanTeam(""); setShowForm(false);
    showMsg("Internal audit plan created.");
    fetchData();
  }

  async function handleDelete(id: string) {
    const { error: err } = await supabase.from("internal_audits").delete().eq("id", id);
    if (err) return showErr(err.message);
    showMsg("Plan deleted.");
    setViewingPlan(null); setEditingPlan(null);
    fetchData();
  }

  function startEdit(plan: InternalAudit) {
    setEditingPlan(plan.id);
    setEditTitle(plan.title);
    setEditTeam(plan.audit_team || "");
    setEditBranch(plan.branch_id);
    setEditDepts(plan.departments);
    setViewingPlan(null);
  }

  async function handleSaveEdit(id: string) {
    if (!editTitle.trim() || !editBranch) return showErr("Enter a title and select a branch.");
    if (editDepts.length === 0) return showErr("Select at least one department.");
    setSaving(true);
    const { error: err } = await supabase.from("internal_audits").update({
      title: editTitle.trim(), branch_id: editBranch,
      departments: editDepts, audit_team: editTeam.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    setSaving(false);
    if (err) return showErr(err.message);
    setEditingPlan(null); setViewingPlan(id);
    showMsg("Plan updated.");
    fetchData();
  }

  async function addFinding(plan: InternalAudit) {
    if (!findingDept || !findingDetail.trim()) return showErr("Select a department and enter finding details.");
    const updated = [...plan.findings, { department: findingDept, type: findingType, detail: findingDetail.trim() }];
    setSaving(true);
    const { error: err } = await supabase.from("internal_audits").update({ findings: updated, updated_at: new Date().toISOString() }).eq("id", plan.id);
    setSaving(false);
    if (err) return showErr(err.message);
    setFindingDept(""); setFindingDetail(""); setFindingType("Observation"); setShowFindingForm(false);
    showMsg("Finding added.");
    fetchData();
  }

  async function deleteFinding(plan: InternalAudit, index: number) {
    const updated = plan.findings.filter((_, i) => i !== index);
    const { error: err } = await supabase.from("internal_audits").update({ findings: updated, updated_at: new Date().toISOString() }).eq("id", plan.id);
    if (err) return showErr(err.message);
    fetchData();
  }

  const viewPlan = viewingPlan ? plans.find((p) => p.id === viewingPlan) : null;
  const editPlan = editingPlan ? plans.find((p) => p.id === editingPlan) : null;

  const inputCls = "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark] w-full";
  const selectCls = "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark] w-full";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/audit/plan" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to Audit Plan
          </Link>
        </div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Internal Standard</h1>
            <p className="text-blue-200/60">Internal audit plans across branch departments and findings</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
          >
            {showForm ? "Cancel" : "+ New Internal Plan"}
          </button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

        {showForm && (
          <form onSubmit={handleCreate} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-8 space-y-4">
            <div>
              <label className="block text-sm text-blue-200/60 mb-1">Plan Title</label>
              <input value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} placeholder="e.g. FSL Kitchen Internal Audit" className={inputCls} />
            </div>
            <div>
              <label className="block text-sm text-blue-200/60 mb-1">Branch</label>
              <select value={selectedBranch} onChange={(e) => { setSelectedBranch(e.target.value); setSelectedDepts([]); }} className={selectCls}>
                <option value="">Select branch</option>
                {branches.map((b) => (<option key={b.id} value={b.id} className="bg-slate-800">{b.name}</option>))}
              </select>
            </div>
            {selBranch && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm text-blue-200/60">Departments</label>
                  <button type="button" onClick={() => setSelectedDepts(selBranch.departments.map((d) => d.name))} className="text-xs text-blue-400 hover:text-blue-300">Select all</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selBranch.departments.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDept(d.name)}
                      className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${selectedDepts.includes(d.name) ? "bg-purple-600/30 border-purple-500/40 text-white" : "bg-white/5 border-white/10 text-blue-200/60 hover:border-white/30"}`}
                    >
                      {d.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm text-blue-200/60 mb-1">Audit Team</label>
              <input value={planTeam} onChange={(e) => setPlanTeam(e.target.value)} placeholder="Names of auditors" className={inputCls} />
            </div>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? "Creating..." : "Create Plan"}
            </button>
          </form>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : plans.length === 0 ? (
          <p className="text-blue-200/40 text-center py-16">No internal audit plans yet. Create a plan to start recording findings.</p>
        ) : (
          <div className="space-y-4">
            {plans.map((plan) => (
              <div key={plan.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-white">{plan.title}</h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${statusBadge(plan.status)}`}>{plan.status}</span>
                      <span className="text-xs text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-full">{plan.branch_name}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {plan.departments.map((d) => (
                        <span key={d} className="px-2 py-0.5 text-xs rounded-full bg-white/5 border border-white/10 text-blue-200/70">{d}</span>
                      ))}
                    </div>
                    {plan.audit_team && <p className="text-xs text-blue-200/40 mt-2">Team: {plan.audit_team}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-blue-200/50">{plan.findings.length} finding{plan.findings.length !== 1 ? "s" : ""}</span>
                    <button onClick={() => { setViewingPlan(plan.id); setEditingPlan(null); setShowFindingForm(false); }} className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white">Open</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {editPlan && (
          <div className="mt-8 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Edit Plan</h2>
              <button onClick={() => { if (confirm("Delete plan?")) handleDelete(editPlan.id); }} className="text-xs text-red-400 hover:text-red-300">Delete</button>
            </div>
            <div className="space-y-4">
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Plan Title" className={inputCls} />
              <select value={editBranch} onChange={(e) => { setEditBranch(e.target.value); setEditDepts([]); }} className={selectCls}>
                <option value="">Select branch</option>
                {branches.map((b) => (<option key={b.id} value={b.id} className="bg-slate-800">{b.name}</option>))}
              </select>
              {editSelBranch && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-blue-200/60">Departments</span>
                    <button type="button" onClick={() => setEditDepts(editSelBranch.departments.map((d) => d.name))} className="text-xs text-blue-400 hover:text-blue-300">Select all</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editSelBranch.departments.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleEditDept(d.name)}
                        className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${editDepts.includes(d.name) ? "bg-purple-600/30 border-purple-500/40 text-white" : "bg-white/5 border-white/10 text-blue-200/60 hover:border-white/30"}`}
                      >
                        {d.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <input value={editTeam} onChange={(e) => setEditTeam(e.target.value)} placeholder="Audit Team" className={inputCls} />
              <div className="flex gap-2">
                <button onClick={() => handleSaveEdit(editPlan.id)} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button>
                <button onClick={() => { setEditingPlan(null); setViewingPlan(editPlan.id); }} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {viewPlan && (
          <div className="mt-8 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">{viewPlan.title}</h2>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="text-xs text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-full">{viewPlan.branch_name}</span>
                  {viewPlan.departments.map((d) => (
                    <span key={d} className="px-2 py-0.5 text-xs rounded-full bg-white/5 border border-white/10 text-blue-200/70">{d}</span>
                  ))}
                </div>
                {viewPlan.audit_team && <p className="text-xs text-blue-200/40 mt-2">Team: {viewPlan.audit_team}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => startEdit(viewPlan)} className="text-xs text-blue-300 hover:text-white">Edit</button>
                <button onClick={() => { setViewingPlan(null); setShowFindingForm(false); }} className="text-xs text-blue-200/60 hover:text-white">Close</button>
              </div>
            </div>

            <div className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Findings</h3>
                <button onClick={() => setShowFindingForm((v) => !v)} className="px-3 py-1.5 text-xs rounded-lg bg-purple-600 hover:bg-purple-500 text-white">{showFindingForm ? "Cancel" : "+ Add Finding"}</button>
              </div>

              {showFindingForm && (
                <div className="mb-4 p-4 bg-white/5 border border-white/10 rounded-xl space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <select value={findingDept} onChange={(e) => setFindingDept(e.target.value)} className={selectCls}>
                      <option value="">Department</option>
                      {viewPlan.departments.map((d) => (<option key={d} value={d} className="bg-slate-800">{d}</option>))}
                    </select>
                    <select value={findingType} onChange={(e) => setFindingType(e.target.value as Finding["type"])} className={selectCls}>
                      <option value="Observation" className="bg-slate-800">Observation</option>
                      <option value="Nonconformity" className="bg-slate-800">Nonconformity</option>
                      <option value="Opportunity" className="bg-slate-800">Opportunity</option>
                    </select>
                  </div>
                  <textarea value={findingDetail} onChange={(e) => setFindingDetail(e.target.value)} placeholder="Finding details..." rows={2} className={inputCls} />
                  <button onClick={() => addFinding(viewPlan)} disabled={saving} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium disabled:opacity-50">{saving ? "Adding..." : "Add Finding"}</button>
                </div>
              )}

              {viewPlan.findings.length === 0 ? (
                <p className="text-blue-200/40 text-center py-8 text-sm">No findings yet. Add the first finding for this internal audit.</p>
              ) : (
                <div className="space-y-2">
                  {viewPlan.findings.map((f, i) => (
                    <div key={i} className="p-3 bg-white/5 rounded-lg flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${typeBadge(f.type)}`}>{f.type}</span>
                        <div>
                          <span className="text-xs text-purple-300">{f.department}</span>
                          <p className="text-sm text-white/80 mt-0.5">{f.detail}</p>
                        </div>
                      </div>
                      <button onClick={() => deleteFinding(viewPlan, i)} className="text-xs text-red-400/60 hover:text-red-300">Remove</button>
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