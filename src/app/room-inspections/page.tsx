"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface Branch { id: string; name: string; }
interface Category { id: string; name: string; }
interface ChecklistItem { id: string; category_id: string; point: string; position: number; }
interface RoomRow {
  id: string; branch_id: string; category_id: string | null; name: string;
  branch_name?: string; category_name?: string;
}
interface RoomSnap { id: string; name: string; category_id: string | null; category_name: string | null; }
interface PointResult { point: string; status: "ok" | "obs" | "na"; note: string; }
interface RoomInspection {
  room_id: string; room_name: string; category_id: string | null; category_name: string | null;
  notes: string; points: PointResult[];
}
interface VisitPlan {
  id: string; branch_id: string; visit_date: string; title: string | null; inspector: string | null;
  notes: string | null; status: string; rooms: RoomSnap[]; inspections: RoomInspection[];
  created_at: string; updated_at: string; branch_name?: string;
}

type Tab = "calendar" | "plan" | "visits" | "setup";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BRANCH_COLORS = ["bg-teal-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-pink-500"];

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDayOfMonth(y: number, m: number) { return new Date(y, m, 1).getDay(); }
function toDateStr(y: number, m: number, d: number) { return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
function parseLocalDate(s: string) {
  const [y, m, d] = (s || "").split("-").map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const statusBadge = (status: string) =>
  status === "Completed"
    ? "bg-green-500/20 text-green-300"
    : status === "In Progress"
    ? "bg-amber-500/20 text-amber-300"
    : "bg-white/10 text-teal-200/70";

const sevBadge = (status: string) =>
  status === "ok"
    ? "bg-green-500/15 border-green-500/30 text-green-300"
    : status === "obs"
    ? "bg-amber-500/20 border-amber-500/30 text-amber-300"
    : "bg-white/10 border-white/10 text-white/50";

function roomInit(room: RoomSnap, checklists: Record<string, ChecklistItem[]>): RoomInspection {
  const points = (room.category_id && checklists[room.category_id] ? checklists[room.category_id] : [])
    .map((p) => ({ point: p.point, status: "na" as const, note: "" }));
  return { room_id: room.id, room_name: room.name, category_id: room.category_id, category_name: room.category_name, notes: "", points };
}

function summarize(insp: RoomInspection[]) {
  let ok = 0, obs = 0, na = 0, notes = 0;
  const observations: { room: string; point: string; note: string }[] = [];
  insp.forEach((r) => {
    r.points.forEach((p) => {
      if (p.status === "ok") ok++;
      else if (p.status === "obs") { obs++; if (p.note.trim()) observations.push({ room: r.room_name, point: p.point, note: p.note.trim() }); }
      else na++;
    });
    if (r.notes.trim()) notes++;
  });
  const scored = ok + obs;
  const pct = scored ? Math.round((ok / scored) * 100) : null;
  const verdict = pct === null ? "Not inspected" : obs === 0 ? "Conforming" : pct >= 80 ? "Conforming with observations" : "Non-conforming";
  return { ok, obs, na, notes, pct, verdict, observations };
}

export default function RoomInspectionsPage() {
  const supabase = createClient();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [checklists, setChecklists] = useState<Record<string, ChecklistItem[]>>({});
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [visits, setVisits] = useState<VisitPlan[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<Tab>("calendar");
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState("");

  const [pvBranch, setPvBranch] = useState("");
  const [pvDate, setPvDate] = useState(todayStr());
  const [pvTitle, setPvTitle] = useState("");
  const [pvInspector, setPvInspector] = useState("");
  const [pvNotes, setPvNotes] = useState("");
  const [pvRooms, setPvRooms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [catName, setCatName] = useState("");
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [newPoints, setNewPoints] = useState<Record<string, string>>({});
  const [rmBranch, setRmBranch] = useState("");
  const [rmName, setRmName] = useState("");
  const [rmCat, setRmCat] = useState("");

  const [activeVisit, setActiveVisit] = useState<VisitPlan | null>(null);
  const [insp, setInsp] = useState<RoomInspection[]>([]);
  const [reportVisit, setReportVisit] = useState<VisitPlan | null>(null);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: b } = await supabase.from("branches").select("id,name").order("name");
    const { data: c } = await supabase.from("room_categories").select("id,name").order("created_at");
    const { data: cl } = await supabase.from("room_checklists").select("id,category_id,point,position").order("position");
    const { data: r } = await supabase.from("rooms").select("*, branches(name), room_categories(name)").order("name");
    const { data: v } = await supabase.from("visit_plans").select("*, branches(name)").order("visit_date", { ascending: false });
    setBranches(b || []);
    setCategories(c || []);
    const clMap: Record<string, ChecklistItem[]> = {};
    (cl || []).forEach((x: any) => {
      if (!clMap[x.category_id]) clMap[x.category_id] = [];
      clMap[x.category_id].push({ id: x.id, category_id: x.category_id, point: x.point, position: x.position });
    });
    setChecklists(clMap);
    setRooms((r || []).map((x: any) => ({
      id: x.id, branch_id: x.branch_id, category_id: x.category_id, name: x.name,
      branch_name: x.branches?.name || "", category_name: x.room_categories?.name || null,
    })));
    setVisits((v || []).map((x: any) => ({
      id: x.id, branch_id: x.branch_id, visit_date: x.visit_date, title: x.title, inspector: x.inspector,
      notes: x.notes, status: x.status, rooms: x.rooms || [], inspections: x.inspections || [],
      created_at: x.created_at, updated_at: x.updated_at, branch_name: x.branches?.name || "",
    })));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const branchColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    branches.forEach((b, i) => { map[b.id] = BRANCH_COLORS[i % BRANCH_COLORS.length]; });
    return map;
  }, [branches]);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 3500); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 4000); }

  const visitsByDate = useMemo(() => {
    const map: Record<string, VisitPlan[]> = {};
    visits.forEach((v) => {
      const d = parseLocalDate(v.visit_date);
      if (isNaN(d.getTime())) return;
      const key = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
      if (!map[key]) map[key] = [];
      map[key].push(v);
    });
    return map;
  }, [visits]);

  const calendarCells = useMemo(() => {
    const cells: { day: number; key: string; current: boolean }[] = [];
    const daysInMonth = getDaysInMonth(calYear, calMonth);
    const firstDay = getFirstDayOfMonth(calYear, calMonth);
    const prevMonthDays = getDaysInMonth(calYear, calMonth - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = calMonth === 0 ? 11 : calMonth - 1;
      const y = calMonth === 0 ? calYear - 1 : calYear;
      cells.push({ day: d, key: toDateStr(y, m, d), current: false });
    }
    for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, key: toDateStr(calYear, calMonth, d), current: true });
    while (cells.length % 7 !== 0) {
      const d = cells.length - (firstDay + daysInMonth) + 1;
      const m = calMonth === 11 ? 0 : calMonth + 1;
      const y = calMonth === 11 ? calYear + 1 : calYear;
      cells.push({ day: d, key: toDateStr(y, m, d), current: false });
    }
    return cells;
  }, [calYear, calMonth]);

  const pvRoomsInBranch = rooms.filter((r) => r.branch_id === pvBranch);
  function togglePvRoom(id: string) {
    setPvRooms((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function handleCreateVisit() {
    if (!pvBranch) return showErr("Select a branch.");
    if (!pvDate) return showErr("Select a visit date.");
    if (pvRooms.length === 0) return showErr("Select at least one room to inspect.");
    const snap: RoomSnap[] = pvRooms.map((id) => {
      const r = rooms.find((x) => x.id === id)!;
      return { id: r.id, name: r.name, category_id: r.category_id, category_name: r.category_name || null };
    });
    const title = pvTitle.trim() || `Visit — ${branches.find((b) => b.id === pvBranch)?.name || "Branch"} (${pvDate})`;
    setSaving(true);
    const { error: err } = await supabase.from("visit_plans").insert({
      branch_id: pvBranch, visit_date: pvDate, title, inspector: pvInspector.trim() || null,
      notes: pvNotes.trim() || null, status: "Planned", rooms: snap, inspections: [],
    });
    setSaving(false);
    if (err) return showErr(err.message);
    setPvBranch(""); setPvTitle(""); setPvInspector(""); setPvNotes(""); setPvRooms([]); setPvDate(todayStr());
    showMsg("Visit planned.");
    fetchData();
  }

  async function handleDeleteVisit(id: string) {
    if (!confirm("Delete this visit and all its inspections?")) return;
    const { error } = await supabase.from("visit_plans").delete().eq("id", id);
    if (error) return showErr(error.message);
    showMsg("Visit deleted.");
    fetchData();
  }

  async function handleStatusChange(id: string, status: string) {
    const { error } = await supabase.from("visit_plans").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return showErr(error.message);
    fetchData();
  }

  function openInspect(v: VisitPlan) {
    setReportVisit(null);
    setInsp(v.inspections.length ? v.inspections : v.rooms.map((r) => roomInit(r, checklists)));
    setActiveVisit(v);
  }

  function updatePoint(roomIdx: number, ptIdx: number, patch: Partial<PointResult>) {
    setInsp((prev) => prev.map((r, ri) => ri === roomIdx ? {
      ...r, points: r.points.map((p, pi) => pi === ptIdx ? { ...p, ...patch } : p),
    } : r));
  }

  function updateRoomNotes(roomIdx: number, notes: string) {
    setInsp((prev) => prev.map((r, ri) => ri === roomIdx ? { ...r, notes } : r));
  }

  async function handleSaveInspection() {
    if (!activeVisit) return;
    const { error } = await supabase.from("visit_plans").update({
      inspections: insp,
      status: activeVisit.status === "Completed" ? "Completed" : "In Progress",
      updated_at: new Date().toISOString(),
    }).eq("id", activeVisit.id);
    if (error) return showErr(error.message);
    showMsg("Inspection saved.");
    fetchData();
  }

  function handleStatusPoint(roomIdx: number, ptIdx: number, status: "ok" | "obs" | "na") {
    updatePoint(roomIdx, ptIdx, { status });
  }

  async function handleAddCategory() {
    if (!catName.trim()) return showErr("Enter a category name.");
    const { data, error } = await supabase.from("room_categories").insert({ name: catName.trim() }).select("id").single();
    if (error) return showErr(error.message);
    setCatName("");
    setExpandedCat(data.id);
    showMsg("Category added. Now add its 'How things should be' checklist.");
    fetchData();
  }

  async function handleDeleteCategory(id: string) {
    if (!confirm("Delete this category and its checklist? Rooms going on this recipe keep inspections but show as Uncategorized.")) return;
    const { error } = await supabase.from("room_categories").delete().eq("id", id);
    if (error) return showErr(error.message);
    showMsg("Category deleted.");
    fetchData();
  }

  async function handleAddPoint(catId: string) {
    const text = (newPoints[catId] || "").trim();
    if (!text) return showErr("Enter a checklist point.");
    const pos = (checklists[catId] || []).length;
    const { error } = await supabase.from("room_checklists").insert({ category_id: catId, point: text, position: pos });
    if (error) return showErr(error.message);
    setNewPoints((s) => ({ ...s, [catId]: "" }));
    showMsg("Checklist point added.");
    fetchData();
  }

  async function handleDeletePoint(id: string) {
    const { error } = await supabase.from("room_checklists").delete().eq("id", id);
    if (error) return showErr(error.message);
    fetchData();
  }

  async function handleAddRoom() {
    if (!rmBranch) return showErr("Select a branch.");
    if (!rmName.trim()) return showErr("Enter a room name.");
    if (!rmCat) return showErr("Select a room category.");
    const { error } = await supabase.from("rooms").insert({ branch_id: rmBranch, name: rmName.trim(), category_id: rmCat });
    if (error) return showErr(error.message);
    setRmName(""); setRmCat("");
    showMsg("Room added.");
    fetchData();
  }

  async function handleDeleteRoom(id: string) {
    if (!confirm("Delete this room?")) return;
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) return showErr(error.message);
    fetchData();
  }

  function downloadPdf(v: VisitPlan, sum: ReturnType<typeof summarize>) {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.setTextColor(20, 40, 80);
    doc.text("Inspection Report", 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(`Branch: ${v.branch_name || ""}   Date: ${v.visit_date}${v.inspector ? `   Inspector: ${v.inspector}` : ""}`, 14, 24);
    doc.text(`Title: ${v.title || ""}`, 14, 30);
    doc.text(`Verdict: ${sum.verdict}   (Conforming ${sum.ok} / Observations ${sum.obs} / N/A ${sum.na})`, 14, 36);
    const head = [["#", "Room", "Checklist Point (How things should be)", "Status", "Notes"]];
    const body: (string | number)[][] = [];
    let n = 1;
    inspOr(v).forEach((r) => {
      r.points.forEach((p) => {
        body.push([n++, r.room_name, p.point, p.status === "ok" ? "OK" : p.status === "obs" ? "OBSERVATION" : "N/A", p.note || ""]);
      });
    });
    if (body.length === 0) body.push([n, "—", "No inspection results yet.", "", ""]);
    autoTable(doc, { startY: 42, head: [head[0]], body, styles: { fontSize: 8 }, headStyles: { fillColor: [13, 148, 136] } });
    doc.save(`inspection-report-${sanitize(v.title || v.id)}.pdf`);
  }

  function sanitize(s: string) { return s.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 60); }

  const reportRooms = reportVisit ? inspOr(reportVisit) : [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function inspOr(v: VisitPlan): RoomInspection[] {
    return v.inspections.length ? v.inspections : v.rooms.map((r) => roomInit(r, checklists));
  }
  function reportSummary(v: VisitPlan) { return summarize(inspOr(v)); }

  const selDayVisits = selectedDay && tab === "calendar" ? (visitsByDate[selectedDay] || []) : [];
  const filteredVisits = branchFilter ? visits.filter((v) => v.branch_id === branchFilter) : visits;

  const reportSum = reportVisit ? reportSummary(reportVisit) : null;
  const activeSum = activeVisit ? summarize(insp) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-900/70 to-slate-950">
      <div className="print:hidden"><Navbar /></div>
      <main className="max-w-6xl mx-auto px-6 py-16">
        {!activeVisit && !reportVisit && (
          <div className="mb-8 no-print">
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
              Back to Dashboard
            </Link>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-4 mb-6 no-print">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Room Inspections</h1>
            <p className="text-teal-200/60">{activeVisit ? "Room inspection workspace" : reportVisit ? "Inspection report" : "Plan room inspections, check rooms against 'How things should be', and generate inspection reports"}</p>
          </div>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6 no-print">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6 no-print">{message}</div>}

        {activeVisit && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-teal-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-teal-400/20 rounded-2xl p-6 no-print">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold text-white">{activeVisit.title || "Visit"}</h2>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${statusBadge(activeVisit.status)}`}>{activeVisit.status}</span>
                  </div>
                  <p className="text-sm text-teal-200/60 mt-1">{activeVisit.branch_name} · {activeVisit.visit_date}{activeVisit.inspector ? ` · ${activeVisit.inspector}` : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setActiveVisit(null); setReportVisit(null); }} className="px-4 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors">Back</button>
                  <button onClick={handleSaveInspection} className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 hover:bg-teal-500 text-white transition-colors shadow-lg shadow-teal-600/25">Save Inspection</button>
                </div>
              </div>
              {activeSum && (
                <div className="flex flex-wrap gap-2 mt-4 text-xs">
                  <span className="px-2.5 py-1 rounded-full bg-green-500/15 border border-green-500/30 text-green-300">OK {activeSum.ok}</span>
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300">Observations {activeSum.obs}</span>
                  <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-white/50">N/A {activeSum.na}</span>
                  <span className="px-2.5 py-1 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-200">{activeSum.pct === null ? "Not scored" : `${activeSum.pct}% conforming`}</span>
                </div>
              )}
            </div>

            {insp.map((r, ri) => (
              <div key={r.room_id} className="bg-gradient-to-br from-teal-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-teal-400/20 rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{r.room_name}</h3>
                    <span className="text-xs text-teal-200/60">{r.category_name || "Uncategorized"}</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-full bg-green-500/15 border border-green-500/30 text-green-300">{r.points.filter((p) => p.status === "ok").length} OK</span>
                    <span className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300">{r.points.filter((p) => p.status === "obs").length} Obs</span>
                  </div>
                </div>

                {r.points.length === 0 ? (
                  <p className="text-sm text-teal-200/40">No checklist for this room{'·'}s category yet — add points under Rooms {'&'} Categories to inspect against "How things should be".</p>
                ) : (
                  <div className="space-y-2">
                    {r.points.map((p, pi) => (
                      <div key={pi} className="p-3 bg-white/5 rounded-xl border border-white/10">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-teal-200/40 mt-1 shrink-0">{pi + 1}.</span>
                            <p className="text-sm text-white/85">{p.point}</p>
                          </div>
                          <div className="flex gap-1.5">
                            {(["ok", "obs", "na"] as const).map((s) => (
                              <button key={s} onClick={() => handleStatusPoint(ri, pi, s)}
                                className={`px-3 py-1 text-xs rounded-full border transition-colors ${p.status === s ? sevBadge(s) + " ring-1 ring-white/10" : "bg-white/5 border-white/10 text-white/40 hover:text-white/70"}`}>
                                {s === "ok" ? "OK" : s === "obs" ? "Observation" : "N/A"}
                              </button>
                            ))}
                          </div>
                        </div>
                        <input
                          type="text"
                          value={p.note}
                          onChange={(e) => updatePoint(ri, pi, { note: e.target.value })}
                          placeholder={p.status === "obs" ? "What was observed / what should change?" : "Optional note"}
                          className="mt-2 w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  value={r.notes}
                  onChange={(e) => updateRoomNotes(ri, e.target.value)}
                  placeholder="Other room observations..."
                  rows={2}
                  className="mt-3 w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>
            ))}
          </div>
        )}

        {reportVisit && reportSum && (
          <div className="bg-white text-slate-900 rounded-2xl shadow-2xl p-8 sm:p-10">
            <div className="flex items-center justify-between gap-3 no-print">
              <div className="flex gap-2">
                <button onClick={() => { setReportVisit(null); }} className="px-4 py-2 text-sm rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors">Back</button>
                <button onClick={() => window.print()} className="px-4 py-2 text-sm rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors">Print</button>
                <button onClick={() => downloadPdf(reportVisit, reportSum)} className="px-4 py-2 text-sm rounded-lg bg-teal-600 hover:bg-teal-500 text-white transition-colors">Download PDF</button>
              </div>
            </div>
            <div className="text-center mt-4">
              <h1 className="text-2xl font-bold text-slate-900">INSPECTION REPORT</h1>
              <p className="text-slate-500 text-sm mt-1">{reportVisit.title || "Visit"} · {reportVisit.branch_name} · {reportVisit.visit_date}{reportVisit.inspector ? ` · Inspector: ${reportVisit.inspector}` : ""}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-8 text-center">
              {[
                ["Verdict", reportSum.verdict],
                ["Conforming", String(reportSum.ok)],
                ["Observations", String(reportSum.obs)],
                ["N/A", String(reportSum.na)],
                ["Rate", reportSum.pct === null ? "—" : `${reportSum.pct}%`],
              ].map(([k, v]) => (
                <div key={k} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs text-slate-500 uppercase tracking-wide">{k}</div>
                  <div className="text-lg font-bold text-slate-900 mt-1">{v}</div>
                </div>
              ))}
            </div>

            {reportSum.observations.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Observations</h2>
                <div className="space-y-2">
                  {reportSum.observations.map((o, i) => (
                    <div key={i} className="p-3 border-l-4 border-amber-400 bg-amber-50 rounded-r-lg">
                      <p className="text-sm font-medium text-slate-800">{o.room} — {o.point}</p>
                      {o.note && <p className="text-sm text-slate-600 mt-0.5">{o.note}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8 space-y-8">
              {reportRooms.map((r) => (
                <div key={r.room_id}>
                  <div className="flex items-center justify-between border-b border-slate-300 pb-2 mb-2">
                    <h3 className="font-semibold text-slate-900">{r.room_name}</h3>
                    <span className="text-xs text-slate-500">{r.category_name || "Uncategorized"}</span>
                  </div>
                  {r.points.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No checklist points.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500 text-xs uppercase">
                          <th className="py-1 pr-2 w-8">#</th>
                          <th className="py-1 pr-2">Checklist point</th>
                          <th className="py-1 pr-2 w-28">Status</th>
                          <th className="py-1">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.points.map((p, i) => (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                            <td className="py-2 pr-2 text-slate-800">{p.point}</td>
                            <td className="py-2 pr-2">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${p.status === "ok" ? "bg-green-100 text-green-700" : p.status === "obs" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-400"}`}>
                                {p.status === "ok" ? "OK" : p.status === "obs" ? "Observation" : "N/A"}
                              </span>
                            </td>
                            <td className="py-2 text-slate-600">{p.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {r.notes && <p className="text-sm text-slate-600 mt-2 italic">“{r.notes}”</p>}
                  <p className="text-xs text-slate-400 mt-1">{r.points.filter((p) => p.status === "ok").length} OK · {r.points.filter((p) => p.status === "obs").length} Observation{r.points.filter((p) => p.status === "obs").length === 1 ? "" : "s"}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {!activeVisit && !reportVisit && (
          <>
            <div className="flex flex-wrap gap-2 mb-6 no-print">
              {([
                ["calendar", "Calendar"],
                ["plan", "Plan a Visit"],
                ["visits", "Visits"],
                ["setup", "Rooms & Categories"],
              ] as [Tab, string][]).map(([t, label]) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? "bg-teal-600 text-white shadow-lg shadow-teal-600/25" : "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"}`}>
                  {label}
                </button>
              ))}
            </div>

            {tab === "calendar" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-gradient-to-br from-teal-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-teal-400/20 rounded-2xl p-6">
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
                    {DAYS.map((d) => (<div key={d} className="bg-white/5 text-center py-2 text-xs font-medium text-teal-200/60">{d}</div>))}
                    {calendarCells.map((cell) => {
                      const vs = visitsByDate[cell.key] || [];
                      const seen = new Set<string>();
                      const vBranches = vs.filter((v) => { if (seen.has(v.branch_id)) return false; seen.add(v.branch_id); return true; });
                      const isSelected = selectedDay === cell.key;
                      const isToday = cell.key === todayStr();
                      const hasVisit = vBranches.length > 0;
                      const cellColor = hasVisit ? `${branchColorMap[vBranches[0].branch_id] || "bg-teal-500"}` : "";
                      return (
                        <button key={cell.key} onClick={() => { if (cell.current) setSelectedDay(isSelected ? null : cell.key); }}
                          className={`relative min-h-[72px] p-1 text-left transition-colors border ${cell.current ? (isSelected ? "bg-teal-600/30 ring-1 ring-teal-500 border-teal-400/30" : hasVisit ? `${cellColor}/25 border-white/10 hover:brightness-125` : "bg-slate-800/50 border-white/5 hover:bg-white/5") : "bg-slate-900/30 border-white/5"}`}>
                          <span className="flex items-center justify-between">
                            <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-xs font-semibold ${hasVisit ? `${cellColor} text-white shadow` : cell.current ? (isToday ? "text-teal-400 ring-1 ring-teal-500/60 bg-teal-500/10" : "text-white/70") : "text-white/25"}`}>{cell.day}</span>
                            {hasVisit && <span className="text-[9px] font-medium text-white/50">{vBranches.length} b</span>}
                          </span>
                          <div className="mt-1 space-y-0.5">
                            {vBranches.slice(0, 2).map((v) => (
                              <div key={v.branch_id} className={`flex items-center gap-1 text-[10px] leading-tight px-1.5 py-1 rounded-md truncate ${branchColorMap[v.branch_id] || "bg-gray-500"}/40 text-white border border-white/10`}>
                                <span className="truncate">{v.branch_name}</span>
                              </div>
                            ))}
                            {vBranches.length > 2 && <div className="text-[9px] text-white/40 px-1">+{vBranches.length - 2} more</div>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-4">
                    {branches.map((b) => (<div key={b.id} className="flex items-center gap-1.5"><div className={`w-3.5 h-3.5 rounded-md ${branchColorMap[b.id]}`} /><span className="text-xs text-white/60">{b.name}</span></div>))}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-teal-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-teal-400/20 rounded-2xl p-6">
                  <h3 className="text-sm font-semibold text-white mb-3">{selectedDay ? `Visits on ${selectedDay}` : "Select a day"}</h3>
                  {!selectedDay && <p className="text-xs text-teal-200/40">Click a calendar day with colored tiles to see planned visits.</p>}
                  {selectedDay && selDayVisits.length === 0 && <p className="text-xs text-teal-200/40">No visits planned for this day.</p>}
                  {selDayVisits.map((v) => (
                    <div key={v.id} className="mb-3 p-3 bg-white/5 rounded-lg border border-white/5">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${branchColorMap[v.branch_id] || "bg-gray-500"}`} />
                        <span className="text-sm font-medium text-white">{v.branch_name}</span>
                        <span className={`px-2 py-0.5 text-[10px] rounded-full ${statusBadge(v.status)}`}>{v.status}</span>
                      </div>
                      <div className="text-xs text-teal-200/60 ml-4">{v.title}{v.inspector ? ` · ${v.inspector}` : ""}</div>
                      <div className="mt-2 ml-4 flex gap-2">
                        <button onClick={() => openInspect(v)} className="px-3 py-1 text-xs rounded-lg bg-teal-600/30 border border-teal-500/40 text-teal-200 hover:bg-teal-600/50 transition-colors">Inspect</button>
                        <button onClick={() => { setActiveVisit(null); setReportVisit(v); }} className="px-3 py-1 text-xs rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition-colors">Report</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "plan" && (
              <div className="bg-gradient-to-br from-teal-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-teal-400/20 rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Plan a Visit</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-teal-200/70 mb-1">Branch</label>
                    <select value={pvBranch} onChange={(e) => { setPvBranch(e.target.value); setPvRooms([]); }} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500 [color-scheme:dark]">
                      <option value="" className="bg-slate-800">Select branch...</option>
                      {branches.map((b) => (<option key={b.id} value={b.id} className="bg-slate-800">{b.name}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-teal-200/70 mb-1">Visit Date</label>
                    <input type="date" value={pvDate} onChange={(e) => setPvDate(e.target.value)} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500 [color-scheme:dark]" />
                  </div>
                  <div>
                    <label className="block text-sm text-teal-200/70 mb-1">Inspector</label>
                    <input type="text" value={pvInspector} onChange={(e) => setPvInspector(e.target.value)} placeholder="Inspector name" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-teal-200/70 mb-1">Title (optional)</label>
                    <input type="text" value={pvTitle} onChange={(e) => setPvTitle(e.target.value)} placeholder="e.g. Room readiness check" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-teal-200/70 mb-1">Notes (optional)</label>
                    <input type="text" value={pvNotes} onChange={(e) => setPvNotes(e.target.value)} placeholder="Optional notes" className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </div>
                </div>
                {pvBranch && (
                  <div className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm text-teal-200/70">Rooms to inspect ({pvRoomsInBranch.length} in branch)</label>
                      {pvRoomsInBranch.length > 0 && (
                        <button type="button" onClick={() => setPvRooms(pvRooms.length === pvRoomsInBranch.length ? [] : pvRoomsInBranch.map((r) => r.id))} className="text-xs text-teal-400 hover:text-teal-300">{pvRooms.length === pvRoomsInBranch.length ? "Deselect all" : "Select all"}</button>
                      )}
                    </div>
                    {pvRoomsInBranch.length === 0 ? (
                      <p className="text-sm text-teal-200/40">No rooms added for this branch yet — add them under Rooms {'&'} Categories.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {pvRoomsInBranch.map((r) => (
                          <button key={r.id} onClick={() => togglePvRoom(r.id)}
                            className={`px-3 py-2 rounded-lg text-sm border transition-all duration-200 ${pvRooms.includes(r.id) ? "bg-teal-600/30 border-teal-500 text-white" : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"}`}>
                            {r.name}
                            {r.category_name && <span className="ml-1.5 text-[10px] text-teal-200/50">{r.category_name}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-end">
                  <button onClick={handleCreateVisit} disabled={saving} className="px-6 py-3 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-600/50 text-white font-medium rounded-lg transition-all duration-200 shadow-lg shadow-teal-600/25">Plan Visit</button>
                </div>
              </div>
            )}

            {tab === "visits" && (
              <div className="bg-gradient-to-br from-teal-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-teal-400/20 rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <h2 className="text-lg font-semibold text-white">All Visits</h2>
                  <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 [color-scheme:dark]">
                    <option value="" className="bg-slate-800">All branches</option>
                    {branches.map((b) => (<option key={b.id} value={b.id} className="bg-slate-800">{b.name}</option>))}
                  </select>
                </div>
                {loading ? (
                  <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" /></div>
                ) : filteredVisits.length === 0 ? (
                  <p className="text-teal-200/40 text-center py-8">No visits planned yet.</p>
                ) : (
                  <div className="space-y-3">
                    {filteredVisits.map((v) => {
                      const sum = summarize(inspOr(v));
                      return (
                        <div key={v.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white/5 rounded-xl border border-white/5">
                          <div className="flex items-center gap-4 flex-1">
                            <div className={`w-3 h-3 rounded-full ${branchColorMap[v.branch_id] || "bg-gray-500"}`} />
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="text-white font-medium">{v.title || "Visit"}</span>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${statusBadge(v.status)}`}>{v.status}</span>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${v.status === "Completed" ? (sum.verdict.includes("Non-conforming") ? "bg-red-500/20 text-red-300" : sum.verdict.includes("observations") ? "bg-amber-500/20 text-amber-300" : "bg-green-500/20 text-green-300") : "bg-white/10 text-white/60"}`}>{sum.pct === null ? sum.verdict : `${sum.verdict} · ${sum.pct}%`}</span>
                              </div>
                              <div className="text-xs text-teal-200/60 mt-1">{v.branch_name} · {v.visit_date}{v.inspector ? ` · ${v.inspector}` : ""}</div>
                              <div className="flex flex-wrap gap-1 mt-1 text-[11px] text-teal-200/50">
                                <span>{v.rooms.length} room{v.rooms.length === 1 ? "" : "s"}</span>
                                <span>·</span>
                                <span>{sum.ok} OK</span>
                                <span>·</span>
                                <span className="text-amber-300/80">{sum.obs} Obs</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:ml-4 shrink-0">
                            <button onClick={() => openInspect(v)} className="px-3 py-1.5 text-xs rounded-lg bg-teal-600/30 border border-teal-500/40 text-teal-200 hover:bg-teal-600/50 transition-colors">Inspect</button>
                            <button onClick={() => { setActiveVisit(null); setReportVisit(v); }} className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition-colors">Report</button>
                            <select value={v.status} onChange={(e) => handleStatusChange(v.id, e.target.value)}
                              className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 [color-scheme:dark]">
                              <option value="Planned" className="bg-slate-800">Planned</option>
                              <option value="In Progress" className="bg-slate-800">In Progress</option>
                              <option value="Completed" className="bg-slate-800">Completed</option>
                            </select>
                            <button onClick={() => { if (confirm("Delete this visit?")) handleDeleteVisit(v.id); }} className="text-xs text-red-400 hover:text-red-300 transition-colors">Delete</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === "setup" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gradient-to-br from-teal-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-teal-400/20 rounded-2xl p-6">
                  <h2 className="text-lg font-semibold text-white mb-4">Room Categories & Checklists</h2>
                  <div className="flex gap-2 mb-5">
                    <input type="text" value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="New category, e.g. Deluxe Room" className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    <button onClick={handleAddCategory} className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors">Add</button>
                  </div>
                  {categories.length === 0 ? (
                    <p className="text-teal-200/40 text-center py-6">No categories yet. Add one, then define its "How things should be" checklist.</p>
                  ) : (
                    <div className="space-y-3">
                      {categories.map((c) => {
                        const pts = checklists[c.id] || [];
                        const open = expandedCat === c.id;
                        return (
                          <div key={c.id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                            <div className="flex items-center justify-between p-3">
                              <div className="flex items-center gap-2">
                                <button onClick={() => setExpandedCat(open ? null : c.id)} className="text-sm font-medium text-white hover:text-teal-300 transition-colors">{c.name}</button>
                                <span className="text-[10px] text-teal-200/50">{pts.length} point{pts.length === 1 ? "" : "s"}</span>
                              </div>
                              <button onClick={() => { if (confirm(`Delete category "${c.name}"?`)) handleDeleteCategory(c.id); }} className="text-xs text-red-400 hover:text-red-300 transition-colors">Delete</button>
                            </div>
                            {open && (
                              <div className="px-3 pb-3 space-y-2">
                                {pts.map((p) => (
                                  <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/5">
                                    <p className="text-sm text-white/80 flex-1">{p.point}</p>
                                    <button onClick={() => handleDeletePoint(p.id)} className="text-xs text-red-400/70 hover:text-red-300 shrink-0 transition-colors">Del</button>
                                  </div>
                                ))}
                                <div className="flex gap-2">
                                  <input type="text" value={newPoints[c.id] || ""} onChange={(e) => setNewPoints((s) => ({ ...s, [c.id]: e.target.value }))}
                                    placeholder="e.g. Bed linens crisp, no stains, pillows plumped" className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                                  <button onClick={() => handleAddPoint(c.id)} className="px-3 py-2 text-sm bg-teal-600/70 hover:bg-teal-500 text-white rounded-lg transition-colors">Add</button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="bg-gradient-to-br from-teal-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-teal-400/20 rounded-2xl p-6">
                  <h2 className="text-lg font-semibold text-white mb-4">Rooms</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                    <div>
                      <label className="block text-sm text-teal-200/70 mb-1">Branch</label>
                      <select value={rmBranch} onChange={(e) => setRmBranch(e.target.value)} className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500 [color-scheme:dark]">
                        <option value="" className="bg-slate-800">Select branch...</option>
                        {branches.map((b) => (<option key={b.id} value={b.id} className="bg-slate-800">{b.name}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-teal-200/70 mb-1">Category</label>
                      <select value={rmCat} onChange={(e) => setRmCat(e.target.value)} className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500 [color-scheme:dark]">
                        <option value="" className="bg-slate-800">Select category...</option>
                        {categories.map((c) => (<option key={c.id} value={c.id} className="bg-slate-800">{c.name}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-teal-200/70 mb-1">Room name</label>
                      <input type="text" value={rmName} onChange={(e) => setRmName(e.target.value)} placeholder="e.g. Room 101" className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    </div>
                  </div>
                  <div className="flex justify-end mb-5">
                    <button onClick={handleAddRoom} className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors">Add Room</button>
                  </div>
                  <div className="space-y-2">
                    {rooms.length === 0 && <p className="text-teal-200/40 text-center py-4">No rooms yet.</p>}
                    {rooms.map((r) => (
                      <div key={r.id} className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg border border-white/5">
                        <div>
                          <p className="text-sm text-white/85">{r.name}</p>
                          <p className="text-[11px] text-teal-200/50">{r.branch_name}{r.category_name ? ` · ${r.category_name}` : " · Uncategorized"}</p>
                        </div>
                        <button onClick={() => { if (confirm(`Delete room "${r.name}"?`)) handleDeleteRoom(r.id); }} className="text-xs text-red-400/70 hover:text-red-300 transition-colors">Delete</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}