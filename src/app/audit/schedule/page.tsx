"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import EvidenceThumb from "@/components/EvidenceThumb";

interface Branch { id: string; name: string; }
interface Department { id: string; name: string; branch_id: string; }
interface AuditSchedule {
  id: string; branch_id: string; date_from: string; date_to: string;
  auditor: string; status: string; notes: string; created_at: string;
  departments: string[];
  branch_name?: string;
}
interface Finding {
  type?: string; detail?: string; department?: string; recommendation?: string;
  evidence?: string[]; resolved?: boolean; timeline?: number; ncr_number?: string;
  clause?: string; sop?: string; sopClause?: string; policy?: string; policyClause?: string;
}
interface AuditReportItem {
  id: string; kind: "iso" | "internal"; title: string; branch_id: string; branch_name: string;
  departments: string[]; findings: Finding[]; date: string; document_number: string;
  team: string; prepared_by: string; result: string; round: 1 | 2;
}
interface Observation {
  key?: string; area?: string; context?: string; outcome?: string; pictures?: string[];
}
interface VisitItem {
  id: string; branch_id: string; branch_name: string; date: string; purpose: string;
  context: string; visited_by: string; status: string; observations: Observation[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BRANCH_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-pink-500"];

function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfMonth(year: number, month: number) { return new Date(year, month, 1).getDay(); }
function toDateStr(y: number, m: number, d: number) { return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
function parseLocalDate(s: string) {
  const [y, m, d] = (s || "").split("-").map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

function sevClasses(type?: string) {
  switch ((type || "").toLowerCase()) {
    case "critical": return "bg-red-500/20 border-red-500/40 text-red-300";
    case "high": return "bg-orange-500/20 border-orange-500/40 text-orange-300";
    case "medium": return "bg-amber-500/20 border-amber-500/40 text-amber-300";
    case "low": return "bg-blue-500/20 border-blue-500/40 text-blue-300";
    default: return "bg-white/10 border-white/20 text-blue-200";
  }
}

function summaryCounts(findings: Finding[]) {
  const s: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  findings.forEach((f) => { const t = f.type || ""; if (s[t] !== undefined) s[t] += 1; });
  return s;
}

function auditRound(title: string): 1 | 2 {
  return /round\s*2/i.test(title || "") ? 2 : 1;
}

function ReportCard({ report, branchColor }: { report: AuditReportItem; branchColor?: string }) {
  const s = summaryCounts(report.findings);
  const total = report.findings.length;
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-3">
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className={`w-2.5 h-2.5 rounded-full ${branchColor || "bg-gray-500"}`} />
          <span className="text-sm font-semibold text-white">{report.branch_name || "—"}</span>
          <span className={`px-2 py-0.5 text-[10px] rounded-full border ${report.kind === "iso" ? "bg-blue-500/20 border-blue-500/30 text-blue-200" : "bg-purple-500/20 border-purple-500/30 text-purple-200"}`}>
            {report.kind === "iso" ? "ISO 9001" : "Internal"}
          </span>
          <span className={`px-2 py-0.5 text-[10px] rounded-full border ${report.round === 2 ? "bg-orange-500/20 border-orange-500/40 text-orange-200" : "bg-red-500/20 border-red-500/40 text-red-200"}`}>Round {report.round}</span>
          {report.result && <span className="px-2 py-0.5 text-[10px] rounded-full bg-white/10 border border-white/10 text-blue-200/70">{report.result}</span>}
        </div>
        <p className="text-sm text-white/85">{report.title || "Audit Report"}</p>
        <p className="text-[11px] text-blue-200/40 mt-0.5">
          {[
            report.date,
            report.document_number,
            report.team ? `Team: ${report.team}` : "",
            report.prepared_by ? `Prepared by: ${report.prepared_by}` : "",
          ].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="px-2 py-0.5 text-[10px] rounded-full bg-white/10 text-white font-semibold border border-white/10">{total} issue{total !== 1 ? "s" : ""}</span>
        <span className="px-2 py-0.5 text-[10px] rounded-full bg-red-500/20 border border-red-500/40 text-red-200">Critical {s.Critical}</span>
        <span className="px-2 py-0.5 text-[10px] rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-200">High {s.High}</span>
        <span className="px-2 py-0.5 text-[10px] rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-200">Medium {s.Medium}</span>
        <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-200">Low {s.Low}</span>
      </div>

      {report.departments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {report.departments.map((dept, i) => (
            <span key={i} className="px-1.5 py-0.5 text-[10px] bg-white/5 rounded text-blue-200/60">{dept}</span>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {report.findings.length === 0 && <p className="text-[11px] text-blue-200/40">No findings recorded for this audit.</p>}
        {report.findings.map((f, i) => (
          <div key={i} className="bg-slate-900/50 border border-white/5 rounded-lg p-3">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span className="text-[10px] font-semibold text-blue-300">{f.ncr_number || `NCR - QA-${String(i + 1).padStart(2, "0")}`}</span>
              <span className={`px-1.5 py-0.5 text-[10px] rounded-full border ${sevClasses(f.type)}`}>{f.type || "—"}</span>
              {f.department && <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200">{f.department}</span>}
              <span className={`px-1.5 py-0.5 text-[10px] rounded-full border ${f.resolved ? "bg-green-500/20 border-green-500/40 text-green-300" : "bg-white/10 border-white/10 text-blue-200/60"}`}>{f.resolved ? "Resolved" : "Open"}</span>
            </div>
            {f.detail && <p className="text-[11px] text-blue-100/80 leading-relaxed">{f.detail}</p>}
            {(f.clause || f.sopClause || f.policyClause || f.sop || f.policy) && (
              <p className="text-[10px] text-blue-200/50 mt-1">{f.clause || f.sopClause || f.policyClause || f.sop || f.policy}</p>
            )}
            {f.recommendation && (
              <p className="text-[10px] text-emerald-200/70 mt-1"><span className="font-semibold">Recommendation:</span> {f.recommendation}</p>
            )}
            {f.evidence && f.evidence.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {f.evidence.map((url, j) => (
                  <EvidenceThumb key={j} url={url} className="w-20 h-16 object-cover rounded border border-white/15 hover:opacity-80" />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function outcomeClasses(outcome?: string) {
  switch ((outcome || "").toLowerCase()) {
    case "compliant": return "bg-green-500/20 border-green-500/40 text-green-300";
    case "follow-up": return "bg-amber-500/20 border-amber-500/40 text-amber-300";
    case "observation": return "bg-blue-500/20 border-blue-500/40 text-blue-300";
    default: return "bg-white/10 border-white/20 text-blue-200";
  }
}

function visitStatusClasses(status?: string) {
  switch ((status || "").toLowerCase()) {
    case "closed": return "bg-slate-500/20 border-slate-400/40 text-slate-300";
    case "in progress": return "bg-amber-500/20 border-amber-500/40 text-amber-300";
    default: return "bg-emerald-500/20 border-emerald-400/40 text-emerald-300";
  }
}

function VisitReportCard({ visit, branchColor }: { visit: VisitItem; branchColor?: string }) {
  const obs = visit.observations || [];
  return (
    <div className="bg-teal-500/[0.06] border border-teal-400/25 rounded-xl p-4 space-y-3">
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className={`w-2.5 h-2.5 rounded-full ${branchColor || "bg-teal-500"}`} />
          <span className="text-sm font-semibold text-white">{visit.branch_name || "—"}</span>
          <span className="px-2 py-0.5 text-[10px] rounded-full bg-teal-500/20 border border-teal-400/30 text-teal-200">Branch Visit</span>
          {visit.status && <span className={`px-2 py-0.5 text-[10px] rounded-full border ${visitStatusClasses(visit.status)}`}>{visit.status}</span>}
        </div>
        <p className="text-sm text-white/85">{visit.purpose || "Visit"}</p>
        <p className="text-[11px] text-teal-200/40 mt-0.5">
          {[visit.date, visit.visited_by ? `Visited by: ${visit.visited_by}` : ""].filter(Boolean).join(" · ")}
        </p>
      </div>

      {visit.context && <p className="text-[11px] text-blue-100/70 leading-relaxed whitespace-pre-wrap">{visit.context}</p>}

      <div className="flex flex-wrap gap-1.5">
        <span className="px-2 py-0.5 text-[10px] rounded-full bg-white/10 text-white font-semibold border border-white/10">{obs.length} observation{obs.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="space-y-2">
        {obs.length === 0 && <p className="text-[11px] text-teal-200/40">No observations recorded for this visit.</p>}
        {obs.map((o, i) => (
          <div key={o.key || i} className="bg-slate-900/50 border border-white/5 rounded-lg p-3">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span className="text-[10px] font-semibold text-teal-300">{o.area || `Item ${i + 1}`}</span>
              <span className={`px-1.5 py-0.5 text-[10px] rounded-full border ${outcomeClasses(o.outcome)}`}>{o.outcome || "Observation"}</span>
            </div>
            {o.context && <p className="text-[11px] text-blue-100/80 leading-relaxed whitespace-pre-wrap">{o.context}</p>}
            {o.pictures && o.pictures.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {o.pictures.map((url, j) => (
                  <EvidenceThumb key={j} url={url} className="w-20 h-16 object-cover rounded border border-white/15 hover:opacity-80" />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AuditSchedulePage() {
  const supabase = createClient();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [allDepts, setAllDepts] = useState<Department[]>([]);
  const [schedules, setSchedules] = useState<AuditSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [planBySchedule, setPlanBySchedule] = useState<Record<string, "iso" | "internal">>({});
  const [reportItems, setReportItems] = useState<AuditReportItem[]>([]);
  const [visits, setVisits] = useState<VisitItem[]>([]);

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
    const { data: isoReports } = await supabase
      .from("audit_plans")
      .select("id,title,schedule_id,departments,findings,date_of_plan,document_number,audit_team,prepared_by,overall_result,status");
    const { data: intReports } = await supabase
      .from("internal_audits")
      .select("id,title,branch_id,departments,findings,date_of_plan,document_number,audit_team,prepared_by,status");
    const { data: visitRows } = await supabase
      .from("visit_records")
      .select("id,branch_id,visit_date,purpose,context,visited_by,status,observations")
      .order("visit_date");
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
    const branchName = new Map<string, string>((b || []).map((r: any) => [r.id, r.name]));
    const schedBranch = new Map<string, string>((s || []).map((sc: any) => [sc.id, sc.branch_id]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isoItems: AuditReportItem[] = (isoReports || []).filter((p: any) => p.date_of_plan).map((p: any) => {
      const bid = schedBranch.get(p.schedule_id) || "";
      return {
        id: p.id, kind: "iso" as const, title: p.title || "", branch_id: bid,
        branch_name: branchName.get(bid) || "", departments: p.departments || [], findings: p.findings || [],
        date: p.date_of_plan, document_number: p.document_number || "", team: p.audit_team || "",
        prepared_by: p.prepared_by || "", result: p.overall_result || p.status || "", round: auditRound(p.title || ""),
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intItems: AuditReportItem[] = (intReports || []).filter((a: any) => a.date_of_plan).map((a: any) => ({
      id: a.id, kind: "internal" as const, title: a.title || "", branch_id: a.branch_id || "",
      branch_name: branchName.get(a.branch_id) || "", departments: a.departments || [], findings: a.findings || [],
      date: a.date_of_plan, document_number: a.document_number || "", team: a.audit_team || "",
      prepared_by: a.prepared_by || "", result: a.status || "", round: auditRound(a.title || ""),
    }));
    setReportItems([...isoItems, ...intItems]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setVisits((visitRows || []).filter((v: any) => v.visit_date).map((v: any) => ({
      id: v.id, branch_id: v.branch_id || "", branch_name: branchName.get(v.branch_id) || "",
      date: v.visit_date, purpose: v.purpose || "", context: v.context || "",
      visited_by: v.visited_by || "", status: v.status || "",
      observations: Array.isArray(v.observations) ? v.observations : [],
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
      const from = parseLocalDate(s.date_from);
      const to = parseLocalDate(s.date_to);
      if (isNaN(from.getTime()) || isNaN(to.getTime())) return;
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        const key = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
        if (!map[key]) map[key] = [];
        map[key].push(s);
      }
    });
    return map;
  }, [schedules]);

  const filteredDepts = allDepts.filter((d) => d.branch_id === selectedBranch);

  const reportsByDate = useMemo(() => {
    const map: Record<string, AuditReportItem[]> = {};
    reportItems.forEach((r) => {
      if (!r.date) return;
      if (!map[r.date]) map[r.date] = [];
      map[r.date].push(r);
    });
    return map;
  }, [reportItems]);

  const findingsByDate = useMemo(() => {
    const map: Record<string, { r1: number; r2: number }> = {};
    reportItems.forEach((r) => {
      if (!r.date) return;
      if (!map[r.date]) map[r.date] = { r1: 0, r2: 0 };
      if (r.round === 2) map[r.date].r2 += r.findings.length;
      else map[r.date].r1 += r.findings.length;
    });
    return map;
  }, [reportItems]);

  const visitsByDate = useMemo(() => {
    const map: Record<string, VisitItem[]> = {};
    visits.forEach((v) => {
      if (!v.date) return;
      if (!map[v.date]) map[v.date] = [];
      map[v.date].push(v);
    });
    return map;
  }, [visits]);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 3000); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 4000); }

  function planBadge(schedId: string) {
    const kind = planBySchedule[schedId];
    if (kind === "iso") return <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-200">ISO 9001</span>;
    if (kind === "internal") return <span className="px-2 py-0.5 text-[10px] rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200">Internal</span>;
    return <span className="px-2 py-0.5 text-[10px] rounded-full bg-white/10 border border-white/10 text-blue-200/40">No plan yet</span>;
  }

  function isoMentioned(s: AuditSchedule) {
    return /iso/i.test(s.notes || "") || /iso/i.test((s.departments || []).join(" ")) || planBySchedule[s.id] === "iso";
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
    if (!confirm("Delete this schedule and its linked plan (if any)?")) return;
    const delIso = await supabase.from("audit_plans").delete().eq("schedule_id", id);
    if (delIso.error) return showErr(delIso.error.message);
    const delInt = await supabase.from("internal_audits").delete().eq("schedule_id", id);
    if (delInt.error) return showErr(delInt.error.message);
    const { error } = await supabase.from("audit_schedules").delete().eq("id", id);
    if (error) return showErr(error.message);
    showMsg("Schedule and linked plans deleted.");
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
  const selectedDayReports = selectedDay ? reportsByDate[selectedDay] || [] : [];
  const selectedDayVisits = selectedDay ? visitsByDate[selectedDay] || [] : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-16">
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
          <div className="lg:col-span-2 bg-gradient-to-br from-blue-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-blue-400/20 rounded-2xl p-6">
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
                const counts = findingsByDate[cell.key] || { r1: 0, r2: 0 };
                const dayVisits = visitsByDate[cell.key] || [];
                const isSelected = selectedDay === cell.key;
                const isToday = cell.key === toDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
                const hasAudit = auditBranches.length > 0;
                const cellColor = hasAudit ? `${branchColorMap[auditBranches[0].branch_id] || "bg-blue-500"}` : "";
                return (
                  <button key={cell.key} onClick={() => { if (cell.current) setSelectedDay(isSelected ? null : cell.key); }}
                    className={`relative min-h-[150px] p-1.5 text-left transition-colors border ${cell.current ? (isSelected ? "bg-blue-600/30 ring-1 ring-blue-500 border-blue-400/30" : hasAudit || dayVisits.length > 0 ? `${hasAudit ? cellColor : "bg-teal-500"}/25 border-white/10 hover:brightness-125` : "bg-slate-800/50 border-white/5 hover:bg-white/5") : "bg-slate-900/30 border-white/5"}`}>
                    <span className="flex items-start justify-between gap-1">
                      <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-sm font-semibold ${hasAudit ? `${cellColor} text-white shadow` : cell.current ? (isToday ? "text-blue-400 ring-1 ring-blue-500/60 bg-blue-500/10" : "text-white/70") : "text-white/25"}`}>
                        {cell.day}
                      </span>
                      <span className="flex flex-col items-end gap-0.5">
                        {counts.r1 > 0 && (
                          <span title={`Round 1 · ${counts.r1} issue${counts.r1 !== 1 ? "s" : ""}`} className="inline-flex items-center gap-0.5 rounded-full bg-red-500/90 text-white text-[10px] font-bold leading-none px-1.5 py-1 shadow">
                            R1<span className="hidden xl:inline">&nbsp;· {counts.r1}</span>
                          </span>
                        )}
                        {counts.r2 > 0 && (
                          <span title={`Round 2 · ${counts.r2} issue${counts.r2 !== 1 ? "s" : ""}`} className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/90 text-white text-[10px] font-bold leading-none px-1.5 py-1 shadow">
                            R2<span className="hidden xl:inline">&nbsp;· {counts.r2}</span>
                          </span>
                        )}
                      </span>
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {auditBranches.slice(0, 2).map((a) => (
                        <div key={a.branch_id} className={`flex items-center gap-1 text-[11px] leading-tight px-1.5 py-1 rounded-md truncate ${branchColorMap[a.branch_id] || "bg-gray-500"}/40 text-white border border-white/10`}>
                          <span className="truncate">{a.branch_name}</span>
                          {isoMentioned(a) && <span className="shrink-0 px-1 py-px rounded-full bg-blue-500 text-white text-[8px] font-semibold">ISO</span>}
                        </div>
                      ))}
                      {auditBranches.length > 2 && <div className="text-[10px] text-white/40 px-1">+{auditBranches.length - 2} more</div>}
                      {dayVisits.slice(0, 2).map((v) => (
                        <div key={v.id} title={`Visit: ${v.purpose}`} className="flex items-center gap-1 text-[10px] leading-tight px-1.5 py-0.5 rounded-md truncate bg-teal-500/25 text-teal-100 border border-teal-400/30">
                          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>
                          <span className="truncate">Visit · {v.branch_name}</span>
                        </div>
                      ))}
                      {dayVisits.length > 2 && <div className="text-[10px] text-teal-200/60 px-1">+{dayVisits.length - 2} visit{dayVisits.length - 2 !== 1 ? "s" : ""}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-4 items-center">
              <div className="flex items-center gap-1.5"><span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-red-500/90 text-white text-[10px] font-bold">R1</span><span className="text-xs text-white/60">Round 1 issues</span></div>
              <div className="flex items-center gap-1.5"><span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-orange-500/90 text-white text-[10px] font-bold">R2</span><span className="text-xs text-white/60">Round 2 issues</span></div>
              <div className="flex items-center gap-1.5"><span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-teal-500/25 border border-teal-400/30 text-teal-100"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg></span><span className="text-xs text-white/60">Branch visit</span></div>
              {branches.map((b) => (<div key={b.id} className="flex items-center gap-1.5"><div className={`w-3.5 h-3.5 rounded-md ${branchColorMap[b.id]}`} /><span className="text-xs text-white/60">{b.name}</span></div>))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-blue-400/20 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-white mb-3">{selectedDay ? `Reports — ${selectedDay}` : "Select a day"}</h3>
            {!selectedDay && <p className="text-xs text-blue-200/40">Click a calendar day to see its audit reports (with Round 1 / Round 2 issues), branch visit reports and scheduled audits.</p>}
            {selectedDay && (
              <div className="space-y-4 lg:max-h-[80vh] lg:overflow-y-auto lg:pr-1">
                {selectedDayReports.length === 0 && selectedDayVisits.length === 0 && selectedDaySchedules.length === 0 && (
                  <p className="text-xs text-blue-200/40">No audit report or visit recorded for this day.</p>
                )}
                {selectedDayReports.length > 0 && (
                  <div className="space-y-4">
                    {selectedDayReports.map((r) => (
                      <ReportCard key={`${r.kind}-${r.id}`} report={r} branchColor={branchColorMap[r.branch_id]} />
                    ))}
                  </div>
                )}

                {selectedDayVisits.length > 0 && (
                  <div className="pt-2 border-t border-white/10 space-y-4">
                    <h4 className="text-xs font-semibold text-teal-200/70 uppercase tracking-wide">Visit reports on this day</h4>
                    {selectedDayVisits.map((v) => (
                      <VisitReportCard key={v.id} visit={v} branchColor={branchColorMap[v.branch_id]} />
                    ))}
                  </div>
                )}

                {selectedDaySchedules.length > 0 && (
                  <div className="pt-2 border-t border-white/10">
                    <h4 className="text-xs font-semibold text-blue-200/60 uppercase tracking-wide mb-2">Scheduled audits on this day</h4>
                    {selectedDaySchedules.map((s) => (
                      <div key={s.id} className="mb-3 p-3 bg-white/5 rounded-lg border border-white/5">
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-2 h-2 rounded-full ${branchColorMap[s.branch_id] || "bg-gray-500"}`} />
                          <span className="text-sm font-medium text-white">{s.branch_name}</span>
                          {planBadge(s.id)}
                          {isoMentioned(s) && <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-200">notes: ISO</span>}
                        </div>
                        <div className="text-xs text-blue-200/60 ml-4">{s.date_from} → {s.date_to}</div>
                        <div className="text-xs text-blue-200/40 ml-4 mt-1 flex flex-wrap gap-1">
                          {s.departments.map((dept, i) => (<span key={i} className="px-1.5 py-0.5 bg-white/5 rounded">{dept}</span>))}
                        </div>
                        {s.auditor && <div className="text-xs text-blue-200/40 ml-4 mt-0.5">Auditor: {s.auditor}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-blue-400/20 rounded-2xl p-6">
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

        <div className="mt-10 bg-gradient-to-br from-blue-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-blue-400/20 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">All Scheduled Audits</h2>
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : schedules.length === 0 ? (
            <p className="text-blue-200/40 text-center py-8">No scheduled audits yet.</p>
          ) : (
            <div className="space-y-3">
              {schedules.map((s) => (
                <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white/5 rounded-xl border border-white/5">
                  <div className="flex items-center gap-4 flex-1">
                    <div className={`w-3 h-3 rounded-full ${branchColorMap[s.branch_id] || "bg-gray-500"}`} />
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-white font-medium">{s.branch_name}</span>
                        {planBadge(s.id)}
                        {isoMentioned(s) && <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-200">notes: ISO</span>}
                        {planBySchedule[s.id] && <span className="text-xs text-blue-200/40">· 1 plan</span>}
                        <span className={`px-2 py-0.5 text-xs rounded-full ${s.status === "Completed" ? "bg-green-500/20 text-green-300" : s.status === "In Progress" ? "bg-amber-500/20 text-amber-300" : s.status === "Scheduled" ? "bg-blue-500/20 text-blue-300" : "bg-white/10 text-white/60"}`}>{s.status}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.departments.map((dept, i) => (<span key={i} className="px-2 py-0.5 text-xs bg-white/5 rounded text-blue-200/60">{dept}</span>))}
                      </div>
                      <div className="text-xs text-blue-200/40 mt-1">{s.date_from} → {s.date_to}{s.auditor ? ` · ${s.auditor}` : ""}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:ml-4 shrink-0">
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
