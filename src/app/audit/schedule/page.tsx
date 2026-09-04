"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

interface Branch { id: string; name: string; }
interface Department { id: string; name: string; branch_id: string; }
interface AuditSchedule {
  id: string; branch_id: string; department_id: string;
  date_from: string; date_to: string; auditor: string;
  status: string; notes: string; created_at: string;
  branch_name?: string; dept_name?: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BRANCH_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-pink-500"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export default function AuditSchedulePage() {
  const supabase = createClient();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allDepts, setAllDepts] = useState<Department[]>([]);
  const [schedules, setSchedules] = useState<AuditSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [selectedBranch, setSelectedBranch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deptAudits, setDeptAudits] = useState<Record<string, { auditor: string; status: string; notes: string }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: b } = await supabase.from("branches").select("id,name").order("name");
    const { data: d } = await supabase.from("departments").select("id,name,branch_id").order("name");
    const { data: s } = await supabase.from("audit_schedules").select("*, branches(name), departments(name)").order("date_from");
    setBranches(b || []);
    setAllDepts(d || []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSchedules((s || []).map((r: any) => ({
      id: r.id, branch_id: r.branch_id, department_id: r.department_id,
      date_from: r.date_from, date_to: r.date_to, auditor: r.auditor,
      status: r.status, notes: r.notes, created_at: r.created_at,
      branch_name: r.branches?.name || "", dept_name: r.departments?.name || "",
    })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const branchColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    branches.forEach((b, i) => { map[b.id] = BRANCH_COLORS[i % BRANCH_COLORS.length]; });
    return map;
  }, [branches]);

  const schedulesByDate = useMemo(() => {
    const map: Record<string, AuditSchedule[]> = {};
    schedules.forEach((s) => {
      const from = new Date(s.date_from);
      const to = new Date(s.date_to);
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        const key = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
        if (!map[key]) map[key] = [];
        map[key].push(s);
      }
    });
    return map;
  }, [schedules]);

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
    const rows = filteredDepts.filter((d) => deptAudits[d.id]?.auditor || deptAudits[d.id]?.notes).map((d) => ({
      branch_id: selectedBranch, department_id: d.id, date_from: dateFrom, date_to: dateTo,
      auditor: deptAudits[d.id]?.auditor || "", status: deptAudits[d.id]?.status || "Planned", notes: deptAudits[d.id]?.notes || "",
    }));
    if (rows.length === 0) return showErr("Fill in at least one department auditor or notes.");
    setSaving(true);
    const { error: insErr } = await supabase.from("audit_schedules").insert(rows);
    setSaving(false);
    if (insErr) return showErr(insErr.message);
    setDeptAudits({}); setDateFrom(""); setDateTo(""); setSelectedBranch("");
    showMsg(`${rows.length} audit(s) scheduled.`);
    fetchData();
  }

  const filteredDepts = allDepts.filter((d) => d.branch_id === selectedBranch);
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);
  const prevMonthDays = getDaysInMonth(calYear, calMonth - 1);
  const calendarCells: { day: number; month: number; year: number; key: string; current: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = calMonth === 0 ? 11 : calMonth - 1;
    const y = calMonth === 0 ? calYear - 1 : calYear;
    calendarCells.push({ day: d, month: m, year: y, key: toDateStr(y, m, d), current: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarCells.push({ day: d, month: calMonth, year: calYear, key: toDateStr(calYear, calMonth, d), current: true });
  }
  while (calendarCells.length % 7 !== 0) {
    const d = calendarCells.length - (firstDay + daysInMonth) + 1;
    const m = calMonth === 11 ? 0 : calMonth + 1;
    const y = calMonth === 11 ? calYear + 1 : calYear;
    calendarCells.push({ day: d, month: m, year: y, key: toDateStr(y, m, d), current: false });
  }

  const selectedDaySchedules = selectedDay ? schedulesByDate[selectedDay] || [] : [];
  const uniqueBranchesOnDay = useMemo(() => {
    const seen = new Set<string>();
    return selectedDaySchedules.filter((s) => {
      if (seen.has(s.branch_id)) return false;
      seen.add(s.branch_id);
      return true;
    });
  }, [selectedDaySchedules]);

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
        <h1 className="text-3xl font-bold text-white mb-2">Audit Schedule</h1>
        <p className="text-blue-200/60 mb-8">View and schedule audit dates across branches</p>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
          <div className="lg:col-span-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => { setCalMonth(calMonth === 0 ? 11 : calMonth - 1); setCalYear(calMonth === 0 ? calYear - 1 : calYear); setSelectedDay(null); }} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
              </button>
              <h2 className="text-lg font-semibold text-white">{MONTHS[calMonth]} {calYear}</h2>
              <button onClick={() => { setCalMonth(calMonth === 11 ? 0 : calMonth + 1); setCalYear(calMonth === 11 ? calYear + 1 : calYear); setSelectedDay(null); }} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              </button>
            </div>
            <div className="grid grid-cols-7 gap-px bg-white/5 rounded-lg overflow-hidden">
              {DAYS.map((d) => (
                <div key={d} className="bg-white/5 text-center py-2 text-xs font-medium text-blue-200/60">{d}</div>
              ))}
              {calendarCells.map((cell) => {
                const audits = schedulesByDate[cell.key] || [];
                const branchIds = [...new Set(audits.map((a) => a.branch_id))];
                const isSelected = selectedDay === cell.key;
                const isToday = cell.key === toDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
                return (
                  <button
                    key={cell.key}
                    onClick={() => { if (cell.current) setSelectedDay(isSelected ? null : cell.key); }}
                    className={`relative min-h-[72px] p-1.5 text-left transition-colors ${
                      cell.current ? (isSelected ? "bg-blue-600/20 ring-1 ring-blue-500" : "bg-slate-800/50 hover:bg-white/5") : "bg-slate-900/30"
                    }`}
                  >
                    <span className={`text-xs font-medium ${cell.current ? (isToday ? "text-blue-400" : "text-white/70") : "text-white/20"}`}>{cell.day}</span>
                    <div className="mt-1 flex flex-wrap gap-0.5">
                      {branchIds.slice(0, 4).map((bid) => (
                        <div key={bid} className={`w-2 h-2 rounded-full ${branchColorMap[bid] || "bg-gray-500"}`} />
                      ))}
                      {branchIds.length > 4 && <span className="text-[9px] text-white/40">+{branchIds.length - 4}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-4">
              {branches.map((b) => (
                <div key={b.id} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${branchColorMap[b.id]}`} />
                  <span className="text-xs text-white/60">{b.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-white mb-3">{selectedDay ? `Audits on ${selectedDay}` : "Select a day"}</h3>
            {!selectedDay && <p className="text-xs text-blue-200/40">Click a calendar day with colored dots to see scheduled audits.</p>}
            {selectedDay && selectedDaySchedules.length === 0 && <p className="text-xs text-blue-200/40">No audits scheduled for this day.</p>}
            {uniqueBranchesOnDay.map((s) => (
              <div key={s.id} className="mb-3 p-3 bg-white/5 rounded-lg border border-white/5">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full ${branchColorMap[s.branch_id] || "bg-gray-500"}`} />
                  <span className="text-sm font-medium text-white">{s.branch_name}</span>
                </div>
                <div className="text-xs text-blue-200/60 ml-4">
                  {s.dept_name} · {s.date_from} → {s.date_to}
                </div>
                {s.auditor && <div className="text-xs text-blue-200/40 ml-4 mt-0.5">Auditor: {s.auditor}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Schedule Audit</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm text-blue-200/70 mb-1">Date From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]" />
            </div>
            <div>
              <label className="block text-sm text-blue-200/70 mb-1">Date To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]" />
            </div>
            <div>
              <label className="block text-sm text-blue-200/70 mb-1">Branch</label>
              <select value={selectedBranch} onChange={(e) => { setSelectedBranch(e.target.value); setDeptAudits({}); }} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]">
                <option value="" className="bg-slate-800">Select branch...</option>
                {branches.map((b) => (<option key={b.id} value={b.id} className="bg-slate-800">{b.name}</option>))}
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
                          <input type="text" value={deptAudits[dept.id]?.auditor || ""} onChange={(e) => updateDeptAudit(dept.id, "auditor", e.target.value)} placeholder="Auditor name" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </td>
                        <td className="py-3 px-4">
                          <select value={deptAudits[dept.id]?.status || "Planned"} onChange={(e) => updateDeptAudit(dept.id, "status", e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]">
                            <option value="Planned" className="bg-slate-800">Planned</option>
                            <option value="Scheduled" className="bg-slate-800">Scheduled</option>
                            <option value="In Progress" className="bg-slate-800">In Progress</option>
                            <option value="Completed" className="bg-slate-800">Completed</option>
                          </select>
                        </td>
                        <td className="py-3 px-4">
                          <input type="text" value={deptAudits[dept.id]?.notes || ""} onChange={(e) => updateDeptAudit(dept.id, "notes", e.target.value)} placeholder="Notes" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={handleSaveAll} disabled={saving} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition-all duration-200 shadow-lg shadow-blue-600/25">
                  {saving ? "Saving..." : "Save Schedule"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="mt-10 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">All Scheduled Audits</h2>
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : schedules.length === 0 ? (
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
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-3 px-4 text-white">{s.branch_name}</td>
                      <td className="py-3 px-4 text-white">{s.dept_name}</td>
                      <td className="py-3 px-4 text-blue-200/70">{s.date_from} → {s.date_to}</td>
                      <td className="py-3 px-4 text-white">{s.auditor || "—"}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${s.status === "Completed" ? "bg-green-500/20 text-green-300" : s.status === "In Progress" ? "bg-amber-500/20 text-amber-300" : s.status === "Scheduled" ? "bg-blue-500/20 text-blue-300" : "bg-white/10 text-white/60"}`}>{s.status}</span>
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
