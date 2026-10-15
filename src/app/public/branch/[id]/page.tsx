import Link from "next/link";
import QmsBrand from "@/components/QmsBrand";
import PublicTodayAudit from "@/components/PublicTodayAudit";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Summary = { Critical: number; High: number; Medium: number; Low: number };

function computeSummary(findings: any[]): Summary {
  const s: Summary = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  findings.forEach((f: any) => {
    const k: keyof Summary = f?.type;
    if (k === "Critical" || k === "High" || k === "Medium" || k === "Low") s[k] += 1;
  });
  return s;
}

const SEV_STYLES: Record<string, string> = {
  Critical: "bg-red-500/15 border-red-500/40 text-red-300",
  High: "bg-orange-500/15 border-orange-500/40 text-orange-300",
  Medium: "bg-amber-500/15 border-amber-500/40 text-amber-300",
  Low: "bg-sky-500/15 border-sky-500/40 text-sky-300",
};

const VISIT_STATUS: Record<string, string> = {
  Closed: "bg-slate-500/20 text-slate-300",
  "In Progress": "bg-amber-500/20 text-amber-300",
  Open: "bg-emerald-500/20 text-emerald-300",
};

function parseDate(d?: string | null): Date | null {
  if (!d) return null;
  const dt = new Date(d + (d.length === 10 ? "T00:00:00" : ""));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatDay(d?: string | null): string {
  const dt = parseDate(d);
  if (!dt) return "Undated";
  return dt.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

interface Entry {
  key: string;
  kind: "audit" | "visit";
  label: string;
  title: string;
  href: string;
  date: string | null;
  meta: string;
  document_number: string | null;
  badge: string | null;
  findings: any[];
  pdf_public_id: string | null;
}

function SeverityChips({ findings }: { findings: any[] }) {
  if (!findings.length) return null;
  const summary = computeSummary(findings);
  return (
    <div className="flex flex-wrap gap-1.5">
      {(["Critical", "High", "Medium", "Low"] as const).map((sev) =>
        summary[sev] > 0 ? (
          <span key={sev} className={`px-2 py-0.5 text-[10px] rounded-full border ${SEV_STYLES[sev]}`}>
            {sev} {summary[sev]}
          </span>
        ) : null
      )}
    </div>
  );
}

function ReportCard({ e }: { e: Entry }) {
  return (
    <div className="bg-gradient-to-br from-blue-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-blue-400/20 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full border mb-2 ${e.kind === "visit" ? "bg-emerald-500/15 text-emerald-200 border-emerald-400/30" : e.label === "ISO 9001" ? "bg-purple-500/15 text-purple-200 border-purple-400/30" : "bg-blue-500/15 text-blue-200 border-blue-400/30"}`}>
            {e.label}
          </span>
          <h3 className="text-white font-semibold leading-snug break-words">{e.title}</h3>
        </div>
        {e.kind === "visit" && e.badge ? (
          <span className={`shrink-0 px-2 py-0.5 text-[10px] rounded-full ${VISIT_STATUS[e.badge] || "bg-white/10 text-white/70"}`}>{e.badge}</span>
        ) : e.document_number ? (
          <span className="shrink-0 text-[11px] font-mono text-blue-200/60 border border-blue-400/25 bg-blue-500/10 rounded px-2 py-0.5">
            {e.document_number}
          </span>
        ) : null}
      </div>
      {e.meta ? <p className="text-sm text-blue-200/60">{e.meta}</p> : null}
      <SeverityChips findings={e.findings} />
      <Link
        href={e.href}
        className="mt-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-blue-600/25"
      >
        {e.kind === "visit" ? "View Visit Report" : "View Audit Report"}
      </Link>
    </div>
  );
}

export default async function PublicBranchView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: branch } = await supabase.from("branches").select("id,name").eq("id", id).maybeSingle();

  const notFound = (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl text-white font-semibold mb-3">Branch not found</h1>
        <Link href="/public" className="text-blue-300 hover:text-blue-200 underline">Back to public view</Link>
      </div>
    </div>
  );

  if (!branch) return notFound;

  const [{ data: schedules }, { data: auditReports }, { data: visitRecords }] = await Promise.all([
    supabase.from("audit_schedules").select("id").eq("branch_id", id),
    supabase
      .from("audit_reports")
      .select("id,title,document_number,report_date,prepared_by,findings,pdf_public_id,created_at")
      .eq("branch_id", id),
    supabase
      .from("visit_records")
      .select("id,visit_date,purpose,visited_by,status,pdf_public_id,created_at")
      .eq("branch_id", id),
  ]);

  const schedIds = (schedules || []).map((s: any) => s.id);
  let isoPlans: any[] = [];
  if (schedIds.length) {
    const { data } = await supabase
      .from("audit_plans")
      .select("id,title,document_number,date_of_plan,prepared_by,overall_result,findings,pdf_public_id,created_at")
      .in("schedule_id", schedIds);
    isoPlans = data || [];
  }

  const entries: Entry[] = [
    ...(auditReports || []).map((r: any) => ({
      key: `a-${r.id}`,
      kind: "audit" as const,
      label: "Internal Audit",
      title: r.title || "Internal Audit Report",
      href: `/public/report/audit/${r.id}`,
      date: r.report_date || null,
      meta: r.prepared_by ? `Prepared by ${r.prepared_by}` : "",
      document_number: r.document_number || null,
      badge: null,
      findings: Array.isArray(r.findings) ? r.findings : [],
      pdf_public_id: r.pdf_public_id || null,
    })),
    ...isoPlans.map((p: any) => ({
      key: `i-${p.id}`,
      kind: "audit" as const,
      label: "ISO 9001",
      title: p.title || "ISO 9001 Audit Report",
      href: `/public/report/iso/${p.id}`,
      date: p.date_of_plan || null,
      meta: p.prepared_by ? `Prepared by ${p.prepared_by}` : "",
      document_number: p.document_number || null,
      badge: p.overall_result || null,
      findings: Array.isArray(p.findings) ? p.findings : [],
      pdf_public_id: p.pdf_public_id || null,
    })),
    ...(visitRecords || []).map((r: any) => ({
      key: `v-${r.id}`,
      kind: "visit" as const,
      label: "Visit",
      title: r.purpose || "Visit Report",
      href: `/public/report/visit/${r.id}`,
      date: r.visit_date || null,
      meta: r.visited_by ? `Visited by ${r.visited_by}` : "",
      document_number: null,
      badge: r.status || null,
      findings: [],
      pdf_public_id: r.pdf_public_id || null,
    })),
  ];

  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = e.date || "";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  const groupKeys = [...groups.keys()].sort((a, b) => {
    if (a === "") return 1;
    if (b === "") return -1;
    return b.localeCompare(a);
  });
  for (const k of groupKeys) {
    groups.get(k)!.sort((a, b) => (a.kind === b.kind ? a.title.localeCompare(b.title) : a.kind === "audit" ? -1 : 1));
  }

  const auditCount = entries.filter((e) => e.kind === "audit").length;
  const visitCount = entries.length - auditCount;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950">
      <nav className="border-b border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <QmsBrand compact />
            <span className="text-white font-semibold">Quality Management System</span>
          </Link>
          <div className="flex items-center gap-3">
            <PublicTodayAudit />
            <span className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-lg border border-blue-400/30 bg-blue-500/10 text-xs text-blue-200 max-w-[40vw] truncate">
              {branch.name}
            </span>
            <Link
              href="/auth/signin"
              className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all duration-200"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <Link href="/public" className="inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200 transition-colors mb-5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          All branches
        </Link>

        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-white leading-snug break-words">{branch.name}</h1>
          <p className="text-sm text-blue-200/60 mt-2">
            {auditCount} audit report{auditCount === 1 ? "" : "s"} · {visitCount} visit report{visitCount === 1 ? "" : "s"}
          </p>
        </div>

        {groupKeys.length === 0 ? (
          <p className="text-blue-200/60">No reports have been published for this branch yet.</p>
        ) : (
          <div className="space-y-10">
            {groupKeys.map((k) => (
              <section key={k}>
                <div className="flex items-center gap-4 mb-5">
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="w-9 h-9 rounded-lg bg-blue-500/15 border border-blue-400/30 grid place-items-center text-blue-300">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                      </svg>
                    </span>
                    <div>
                      <p className="text-white font-semibold leading-tight">{formatDay(k)}</p>
                      <p className="text-[11px] text-blue-200/50">{groups.get(k)!.length} report{groups.get(k)!.length === 1 ? "" : "s"}</p>
                    </div>
                  </div>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {groups.get(k)!.map((e) => (
                    <ReportCard key={e.key} e={e} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
