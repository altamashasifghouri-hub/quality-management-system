"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

interface Branch {
  id: string;
  name: string;
}

interface Department {
  id: string;
  name: string;
  branch_id: string;
}

interface AuditSchedule {
  id: string;
  branch_id: string;
  department_id: string;
  date_from: string;
  date_to: string;
  auditor: string;
  status: string;
  notes: string;
  created_at: string;
  branch_name?: string;
  dept_name?: string;
}

export default function AuditSchedulePage() {
  const supabase = createClient();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [allDepts, setAllDepts] = useState<Department[]>([]);
  const [schedules, setSchedules] = useState<AuditSchedule[]>([]);

  const [selectedBranch, setSelectedBranch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deptAudits, setDeptAudits] = useState<Record<string, { auditor: string; status: string; notes: string }>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [filterBranch, setFilterBranch] = useState("");

  const fetchData = useCallback(async () => {
    const { data: b } = await supabase.from("branches").select("id,name").order("name");
    const { data: d } = await supabase.from("departments").select("id,name,branch_id").order("name");
    const { data: s } = await supabase
      .from("audit_schedules")
      .select("*, branches(name), departments(name)")
      .order("created_at", { ascending: false });

    setBranches(b || []);
    setAllDepts(d || []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSchedules(
      (s || []).map((r: any) => ({
        id: r.id,
        branch_id: r.branch_id,
        department_id: r.department_id,
        date_from: r.date_from,
        date_to: r.date_to,
        auditor: r.auditor,
        status: r.status,
        notes: r.notes,
        created_at: r.created_at,
        branch_name: r.branches?.name || "",
        dept_name: r.departments?.name || "",
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredDepts = allDepts.filter((d) => d.branch_id === selectedBranch);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 3000); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 4000); }

  function updateDeptAudit(deptId: string, field: string, value: string) {
    setDeptAudits((prev) => {
      const current = prev[deptId] || { auditor: "", status: "Planned", notes: "" };
      return { ...prev, [deptId]: { ...current, [field]: value } };
    });
  }

  async function handleSaveAll() {
    if (!selectedBranch || !dateFrom || !dateTo) return showErr("Select branch and dates first.");
    const rows = filteredDepts
      .filter((d) => deptAudits[d.id]?.auditor || deptAudits[d.id]?.notes)
      .map((d) => ({
        branch_id: selectedBranch,
        department_id: d.id,
        date_from: dateFrom,
        date_to: dateTo,
        auditor: deptAudits[d.id]?.auditor || "",
        status: deptAudits[d.id]?.status || "Planned",
        notes: deptAudits[d.id]?.notes || "",
      }));

    if (rows.length === 0) return showErr("Fill in at least one department auditor or notes.");

    setSaving(true);
    const { error: insErr } = await supabase.from("audit_schedules").insert(rows);
    setSaving(false);
    if (insErr) return showErr(insErr.message);
    setDeptAudits({});
    setDateFrom("");
    setDateTo("");
    setSelectedBranch("");
    showMsg(`${rows.length} audit(s) scheduled.`);
    fetchData();
  }

  async function handleDeleteSchedule(id: string) {
    const { error } = await supabase.from("audit_schedules").delete().eq("id", id);
    if (error) return showErr(error.message);
    showMsg("Schedule deleted.");
    fetchData();
  }

  async function handleStatusChange(id: string, newStatus: string) {
    const { error } = await supabase.from("audit_schedules").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return showErr(error.message);
    fetchData();
  }

  const filteredSchedules = filterBranch
    ? schedules.filter((s) => s.branch_id === filterBranch)
    : schedules;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Navbar />

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/audit" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back to Audit Management
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">Audit Schedule</h1>
        <p className="text-blue-200/60 mb-8">Plan audit dates, select a branch and assign departments</p>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-10">
          <h2 className="text-lg font-semibold text-white mb-4">Schedule Audit</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm text-blue-200/70 mb-1">Date From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-sm text-blue-200/70 mb-1">Date To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-sm text-blue-200/70 mb-1">Branch</label>
              <select
                value={selectedBranch}
                onChange={(e) => { setSelectedBranch(e.target.value); setDeptAudits({}); }}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 [color-scheme:dark]"
              >
                <option value="" className="bg-slate-800">Select branch...</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id} className="bg-slate-800">{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          {selectedBranch && filteredDepts.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-3 px-4 text-blue-200/70 font-medium">Department</th>
                      <th className="text-left py-3 px-4 text-blue-200/70 font-medium">Auditor</th>
                      <th className="text-left py-3 px-4 text-blue-200/70 font-medium">Status</th>
                      <th className="text-left py-3 px-4 text-blue-200/70 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDepts.map((dept) => (
                      <tr key={dept.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                        <td className="py-3 px-4 text-white font-medium">{dept.name}</td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={deptAudits[dept.id]?.auditor || ""}
                            onChange={(e) => updateDeptAudit(dept.id, "auditor", e.target.value)}
                            placeholder="Auditor name"
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <select
                            value={deptAudits[dept.id]?.status || "Planned"}
                            onChange={(e) => updateDeptAudit(dept.id, "status", e.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
                          >
                            <option value="Planned" className="bg-slate-800">Planned</option>
                            <option value="Scheduled" className="bg-slate-800">Scheduled</option>
                            <option value="In Progress" className="bg-slate-800">In Progress</option>
                            <option value="Completed" className="bg-slate-800">Completed</option>
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <input
                            type="text"
                            value={deptAudits[dept.id]?.notes || ""}
                            onChange={(e) => updateDeptAudit(dept.id, "notes", e.target.value)}
                            placeholder="Notes"
                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleSaveAll}
                  disabled={saving}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition-all duration-200 shadow-lg shadow-blue-600/25"
                >
                  {saving ? "Saving..." : "Save Schedule"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Scheduled Audits</h2>
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
            >
              <option value="" className="bg-slate-800">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id} className="bg-slate-800">{b.name}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredSchedules.length === 0 ? (
            <p className="text-blue-200/40 text-center py-8">No scheduled audits yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-blue-200/70 font-medium">Branch</th>
                    <th className="text-left py-3 px-4 text-blue-200/70 font-medium">Department</th>
                    <th className="text-left py-3 px-4 text-blue-200/70 font-medium">Dates</th>
                    <th className="text-left py-3 px-4 text-blue-200/70 font-medium">Auditor</th>
                    <th className="text-left py-3 px-4 text-blue-200/70 font-medium">Status</th>
                    <th className="text-left py-3 px-4 text-blue-200/70 font-medium">Notes</th>
                    <th className="text-right py-3 px-4 text-blue-200/70 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSchedules.map((s) => (
                    <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-3 px-4 text-white">{s.branch_name}</td>
                      <td className="py-3 px-4 text-white">{s.dept_name}</td>
                      <td className="py-3 px-4 text-blue-200/70">{s.date_from} → {s.date_to}</td>
                      <td className="py-3 px-4 text-white">{s.auditor || "—"}</td>
                      <td className="py-3 px-4">
                        <select
                          value={s.status}
                          onChange={(e) => handleStatusChange(s.id, e.target.value)}
                          className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
                        >
                          <option value="Planned" className="bg-slate-800">Planned</option>
                          <option value="Scheduled" className="bg-slate-800">Scheduled</option>
                          <option value="In Progress" className="bg-slate-800">In Progress</option>
                          <option value="Completed" className="bg-slate-800">Completed</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 text-blue-200/60">{s.notes || "—"}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => { if (confirm("Delete this schedule?")) handleDeleteSchedule(s.id); }}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
