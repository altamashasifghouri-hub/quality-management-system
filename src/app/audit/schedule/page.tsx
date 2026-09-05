"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

interface Branch { id: string; name: string; }
interface Department { id: string; name: string; branch_id: string; }
interface AuditSchedule {
  id: string; branch_id: string; date_from: string; date_to: string;
  auditor: string; status: string; notes: string; created_at: string;
  departments: string[];
  branch_name?: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BRANCH_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-pink-500"];

function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfMonth(year: number, month: number) { return new Date(year, month, 1).getDay(); }
function toDateStr(y: number, m: number, d: number) { return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }

export default function AuditSchedulePage() {
  const supabase = createClient();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allDepts, setAllDepts] = useState<Department[]>([]);
  const [schedules, setSchedules] = useState<AuditSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [planBySchedule, setPlanBySchedule] = useState<Record<string, "iso" | "internal">>({});

  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [selectedBranch, setSelectedBranch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
  const [auditor, setAuditor] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: b } = await supabase.from("branches").select("id,name").order("name");
    const { data: d } = await supabase.from("departments").select("id,name,branch_id").order("name");
    const { data: s } = await supabase.from("audit_schedules").select("*, branches(name)").order("date_from");
    const { data: isoPlanRows } = await supabase.from("audit_plans").select("schedule_id");
    const { data: intPlanRows } = await supabase.from("internal_audits").select("schedule_id");
    const pmap: Record<string, "iso" | "internal"> = {};
    (isoPlanRows || []).forEach((r: any) => { if (r.schedule_id) pmap[r.schedule_id] = "iso"; });
    (intPlanRows || []).forEach((r: any) => { if (r.schedule_id && !pmap[r.schedule_id]) pmap[r.schedule_id] = "internal"; });
    setPlanBySchedule(pmap);
    setBranches(b || []);
    setAllDepts(d || []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSchedules((s || []).map((r: any) => ({
      id: r.id, branch_id: r.branch_id, date_from: r.date_from, date_to: r.date_to,
      auditor: r.auditor, status: r.status, notes: r.notes, created_at: r.created_at,
      departments: r.departments || [], branch_name: r.branches?.name || "",
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

  const filteredDepts = allDepts.filter((d) => d.branch_id === selectedBranch);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 3000); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 4000); }

  function planBadge(schedId: string) {
    const kind = planBySchedule[schedId];
    if (kind === "iso") return <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-200">ISO 9001</span>;
    if (kind === "internal") return <span className="px-2 py-0.5 text-[10px] rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200">Internal</span>;
    return <span className="px-2 py-0.5 text-[10px] rounded-full bg-white/10 border border-white/10 text-blue-200/40">No plan yet</span>;
  }

  function toggleDept(deptId: string) {
    setSelectedDepts((prev) => prev.includes(deptId) ? prev.filter((d) => d !== deptId) : [...prev, deptId]);
  }

  function toggleAllDepts() {
    if (selectedDepts.length === filteredDepts.length) {
      setSelectedDepts([]);
    } else {
      setSelectedDepts(filteredDepts.map((d) => d.id));
    }
  }

  async function handleSave() {
    if (!selectedBranch || !dateFrom || !dateTo) return showErr("Select branch and dates.");
    if (selectedDepts.length === 0) return showErr("Select at least one department.");

    const deptNames = selectedDepts.map((id) => allDepts.find((d) => d.id === id)?.name || id);

    setSaving(true);
    const { error: insErr } = await supabase.from("audit_schedules").insert({
      branch_id: selectedBranch, date_from: dateFrom, date_to: dateTo,
      auditor, status: "Planned", notes, departments: deptNames,
    });
    setSaving(false);
    if (insErr) return showErr(insErr.message);
    setSelectedBranch(""); setDateFrom(""); setDateTo(""); setSelectedDepts([]); setAuditor(""); setNotes("");
    showMsg("Audit scheduled.");
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

  const calendarCells = useMemo(() => {
    const cells: { day: number; month: number; year: number; key: string; current: boolean }[] = [];
    const daysInMonth = getDaysInMonth(calYear, calMonth);
    const firstDay = getFirstDayOfMonth(calYear, calMonth);
    const prevMonthDays = getDaysInMonth(calYear, calMonth - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = calMonth === 0 ? 11 : calMonth - 1;
      const y = calMonth === 0 ? calYear - 1 : calYear;
      cells.push({ day: d, month: m, year: y, key: toDateStr(y, m, d), current: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, month: calMonth, year: calYear, key: toDateStr(calYear, calMonth, d), current: true });
    }
    while (cells.length % 7 !== 0) {
      const d = cells.length - (firstDay + daysInMonth) + 1;
      const m = calMonth === 11 ? 0 : calMonth + 1;
      const y = calMonth === 11 ? calYear + 1 : calYear;
      cells.push({ day: d, month: m, year: y, key: toDateStr(y, m, d), current: false });
    }
    return cells;
  }, [calYear, calMonth]);

  const selectedDaySchedules = selectedDay ? schedulesByDate[selectedDay] || [] : [];

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
              {DAYS.map((d) => (<div key={d} className="bg-white/5 text-center py-2 text-xs font-medium text-blue-200/60">{d}</div>))}
              {calendarCells.map((cell) => {
                const audits = schedulesByDate[cell.key] || [];
                const seen = new Set<string>();
                const auditBranches = audits.filter((a) => { if (seen.has(a.branch_id)) return false; seen.add(a.branch_id); return true; });
                const isSelected = selectedDay === cell.key;
                const isToday = cell.key === toDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
                return (
                  <button key={cell.key} onClick={() => { if (cell.current) setSelectedDay(isSelected ? null : cell.key); }}
                    className={`relative min-h-[72px] p-1 text-left transition-colors ${cell.current ? (isSelected ? "bg-blue-600/20 ring-1 ring-blue-500" : "bg-slate-800/50 hover:bg-white/5") : "bg-slate-900/30"}`}>
                    <span className={`text-xs font-medium ${cell.current ? (isToday ? "text-blue-400" : "text-white/70") : "text-white/20"}`}>{cell.day}</span>
                    <div className="mt-0.5 space-y-0.5">
                      {auditBranches.slice(0, 3).map((a) => (
                        <div key={a.branch_id} className={`text-[9px] leading-tight px-1 py-0.5 rounded truncate ${branchColorMap[a.branch_id] || "bg-gray-500"}/30 text-white/90`}>
                          {a.branch_name}
                        </div>
                      ))}
                      {auditBranches.length > 3 && <div className="text-[9px] text-white/40 px-1">+{auditBranches.length - 3} more</div>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-4">
              {branches.map((b) => (<div key={b.id} className="flex items-center gap-1.5"><div className={`w-2.5 h-2.5 rounded-full ${branchColorMap[b.id]}`} /><span className="text-xs text-white/60">{b.name}</span></div>))}
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-white mb-3">{selectedDay ? `Audits on ${selectedDay}` : "Select a day"}</h3>
            {!selectedDay && <p className="text-xs text-blue-200/40">Click a calendar day with colored dots to see scheduled audits.</p>}
            {selectedDay && selectedDaySchedules.length === 0 && <p className="text-xs text-blue-200/40">No audits scheduled for this day.</p>}
            {selectedDaySchedules.map((s) => (
              <div key={s.id} className="mb-3 p-3 bg-white/5 rounded-lg border border-white/5">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full ${branchColorMap[s.branch_id] || "bg-gray-500"}`} />
                  <span className="text-sm font-medium text-white">{s.branch_name}</span>
                  {planBadge(s.id)}
                </div>
                <div className="text-xs text-blue-200/60 ml-4">{s.date_from} → {s.date_to}</div>
                <div className="text-xs text-blue-200/40 ml-4 mt-1 flex flex-wrap gap-1">
                  {s.departments.map((dept, i) => (<span key={i} className="px-1.5 py-0.5 bg-white/5 rounded">{dept}</span>))}
                </div>
                {s.auditor && <div className="text-xs text-blue-200/40 ml-4 mt-0.5">Auditor: {s.auditor}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Schedule Audit</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
              <select value={selectedBranch} onChange={(e) => { setSelectedBranch(e.target.value); setSelectedDepts([]); }} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]">
                <option value="" className="bg-slate-800">Select branch...</option>
                {branches.map((b) => (<option key={b.id} value={b.id} className="bg-slate-800">{b.name}</option>))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-blue-200/70 mb-1">Auditor</label>
              <input type="text" value={auditor} onChange={(e) => setAuditor(e.target.value)} placeholder="Auditor name" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm text-blue-200/70 mb-1">Notes</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          {selectedBranch && filteredDepts.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-blue-200/70">Departments</label>
                <button type="button" onClick={toggleAllDepts} className="text-xs text-blue-400 hover:text-blue-300">{selectedDepts.length === filteredDepts.length ? "Deselect all" : "Select all"}</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {filteredDepts.map((dept) => (
                  <button key={dept.id} onClick={() => toggleDept(dept.id)}
                    className={`px-3 py-2 rounded-lg text-sm border transition-all duration-200 ${selectedDepts.includes(dept.id) ? "bg-blue-600/30 border-blue-500 text-white" : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"}`}>
                    {dept.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={handleSave} disabled={saving} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition-all duration-200 shadow-lg shadow-blue-600/25">
              {saving ? "Saving..." : "Save Schedule"}
            </button>
          </div>
        </div>

        <div className="mt-10 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">All Scheduled Audits</h2>
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : schedules.length === 0 ? (
            <p className="text-blue-200/40 text-center py-8">No scheduled audits yet.</p>
          ) : (
            <div className="space-y-3">
              {schedules.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`w-3 h-3 rounded-full ${branchColorMap[s.branch_id] || "bg-gray-500"}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-white font-medium">{s.branch_name}</span>
                        {planBadge(s.id)}
                        {planBySchedule[s.id] && <span className="text-xs text-blue-200/40">· 1 plan</span>}
                        <span className={`px-2 py-0.5 text-xs rounded-full ${s.status === "Completed" ? "bg-green-500/20 text-green-300" : s.status === "In Progress" ? "bg-amber-500/20 text-amber-300" : s.status === "Scheduled" ? "bg-blue-500/20 text-blue-300" : "bg-white/10 text-white/60"}`}>{s.status}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.departments.map((dept, i) => (<span key={i} className="px-2 py-0.5 text-xs bg-white/5 rounded text-blue-200/60">{dept}</span>))}
                      </div>
                      <div className="text-xs text-blue-200/40 mt-1">{s.date_from} → {s.date_to}{s.auditor ? ` · ${s.auditor}` : ""}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <select value={s.status} onChange={(e) => handleStatusChange(s.id, e.target.value)}
                      className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]">
                      <option value="Planned" className="bg-slate-800">Planned</option>
                      <option value="Scheduled" className="bg-slate-800">Scheduled</option>
                      <option value="In Progress" className="bg-slate-800">In Progress</option>
                      <option value="Completed" className="bg-slate-800">Completed</option>
                    </select>
                    <button onClick={() => { if (confirm("Delete this schedule?")) handleDeleteSchedule(s.id); }} className="text-xs text-red-400 hover:text-red-300 transition-colors">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
