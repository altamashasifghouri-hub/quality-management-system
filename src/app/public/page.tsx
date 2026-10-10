import Link from "next/link";
import QmsBrand from "@/components/QmsBrand";
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

const formatDate = (d?: string | null) =>
  d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : null;

export default async function PublicView() {
  const supabase = await createClient();
  const [{ data: branches }, { data: auditReports }, { data: isoPlans }, { data: schedules }, { data: visitRecords }] = await Promise.all([
    supabase.from("branches").select("id,name"),
    supabase.from("audit_reports").select("id,audit_id,title,document_number,branch_id,report_date,prepared_by,findings,pdf_url,pdf_public_id,created_at").order("created_at", { ascending: false }),
    supabase.from("audit_plans").select("id,schedule_id,title,document_number,date_of_plan,prepared_by,overall_result,findings,pdf_url,pdf_public_id,created_at").order("created_at", { ascending: false }),
    supabase.from("audit_schedules").select("id,branch_id"),
    supabase.from("visit_records").select("id,branch_id,visit_date,purpose,visited_by,status,pdf_url,pdf_public_id,created_at").order("visit_date", { ascending: false }),
  ]);

  const branchName = new Map<string, string>((branches || []).map((b: any) => [b.id, b.name]));
  const schedBranch = new Map<string, string>((schedules || []).map((s: any) => [s.id, s.branch_id]));
  const branchColor = new Map<string, string>(
    (branches || []).map((b: any, i: number) => [
      b.id,
      ["bg-emerald-500/20 text-emerald-300 border-emerald-500/40", "bg-teal-500/20 text-teal-300 border-teal-500/40", "bg-amber-500/20 text-amber-300 border-amber-500/40", "bg-purple-500/20 text-purple-300 border-purple-500/40", "bg-rose-500/20 text-rose-300 border-rose-500/40", "bg-cyan-500/20 text-cyan-300 border-cyan-500/40", "bg-orange-500/20 text-orange-300 border-orange-500/40"][i % 7],
    ])
  );

  const reports = (auditReports || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    document_number: r.document_number,
    branch_id: r.branch_id,
    branch_name: branchName.get(r.branch_id) || "—",
    report_date: r.report_date,
    prepared_by: r.prepared_by,
    findings: Array.isArray(r.findings) ? r.findings : [],
    pdf_url: r.pdf_url || null,
    pdf_public_id: r.pdf_public_id || null,
  }));

  const isoReports = (isoPlans || []).map((p: any) => {
    const branchId = schedBranch.get(p.schedule_id) || "";
    return {
      id: p.id,
      title: p.title,
      document_number: p.document_number,
      branch_id: branchId,
      branch_name: branchName.get(branchId) || "—",
      report_date: p.date_of_plan,
      prepared_by: p.prepared_by,
      overall_result: p.overall_result,
      findings: Array.isArray(p.findings) ? p.findings : [],
      pdf_url: p.pdf_url || null,
      pdf_public_id: p.pdf_public_id || null,
    };
  });

  const visits = (visitRecords || []).map((r: any) => ({
    id: r.id,
    branch_name: branchName.get(r.branch_id) || "—",
    branch_id: r.branch_id,
    visit_date: r.visit_date,
    purpose: r.purpose,
    visited_by: r.visited_by,
    status: r.status,
    pdf_url: r.pdf_url || null,
    pdf_public_id: r.pdf_public_id || null,
  }));

  const totalFindings = reports.reduce((s, r) => s + r.findings.length, 0);
  const isoFindings = isoReports.reduce((s, r) => s + r.findings.length, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950">
      <nav className="border-b border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <QmsBrand compact />
            <span className="text-white font-semibold">Quality Management System</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-lg border border-blue-400/30 bg-blue-500/10 text-xs text-blue-200">
              Public View · Read only
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

      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 leading-tight">
            Audit &amp; Visit Reports
          </h1>
          <p className="text-lg text-blue-200/70 max-w-2xl mx-auto">
            Read-only access to published audit reports and visit evidence reports.
            {reports.length > 0 && (
              <span className="block text-base mt-2">
                {reports.length} audit report{reports.length === 1 ? "" : "s"} with {totalFindings} finding{totalFindings === 1 ? "" : "s"} · {isoReports.length} ISO report{isoReports.length === 1 ? "" : "s"} with {isoFindings} finding{isoFindings === 1 ? "" : "s"} · {visits.length} visit report{visits.length === 1 ? "" : "s"} available.
              </span>
            )}
          </p>
        </div>

        <section className="mb-14">
          <h2 className="text-xl font-semibold text-white mb-5 flex items-center gap-3">
            <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            Audit Reports
          </h2>
          {reports.length === 0 ? (
            <p className="text-blue-200/60">No audit reports have been published yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {reports.map((p) => (
                <div
                  key={p.id}
                  className="bg-gradient-to-br from-blue-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-blue-400/20 rounded-xl p-5 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full border mb-2 ${branchColor.get(p.branch_id) || "bg-white/10 text-white/70 border-white/20"}`}>
                        {p.branch_name}
                      </span>
                      <h3 className="text-white font-semibold leading-snug">{p.title}</h3>
                    </div>
                    {p.document_number && (
                      <span className="shrink-0 text-[11px] font-mono text-blue-200/60 border border-blue-400/25 bg-blue-500/10 rounded px-2 py-0.5">
                        {p.document_number}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-blue-200/60">
                    {formatDate(p.report_date) || ""}
                    {p.prepared_by ? ` · Prepared by ${p.prepared_by}` : ""}
                  </p>
                  {p.findings.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(["Critical", "High", "Medium", "Low"] as const).map((sev) => {
                        const n = computeSummary(p.findings)[sev];
                        return n > 0 ? (
                          <span key={sev} className={`px-2 py-0.5 text-[10px] rounded-full border ${SEV_STYLES[sev]}`}>
                            {sev} {n}
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                  {p.pdf_public_id ? (
                    <Link
                      href={`/public/report/audit/${p.id}`}
                      className="mt-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-blue-600/25"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6V3m0 0L4.5 6m3-3 3 3m7.5 3H21v4.5" />
                      </svg>
                      View Audit Report
                    </Link>
                  ) : (
                    <span className="mt-auto px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-center text-xs text-blue-200/50">
                      PDF not published yet
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-14">
          <h2 className="text-xl font-semibold text-white mb-5 flex items-center gap-3">
            <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            ISO 9001 Reports
          </h2>
          {isoReports.length === 0 ? (
            <p className="text-blue-200/60">No ISO 9001 reports have been published yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {isoReports.map((p) => (
                <div
                  key={p.id}
                  className="bg-gradient-to-br from-blue-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-blue-400/20 rounded-xl p-5 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full border mb-2 ${branchColor.get(p.branch_id) || "bg-white/10 text-white/70 border-white/20"}`}>
                        {p.branch_name}
                      </span>
                      <h3 className="text-white font-semibold leading-snug">{p.title}</h3>
                    </div>
                    {p.document_number && (
                      <span className="shrink-0 text-[11px] font-mono text-blue-200/60 border border-blue-400/25 bg-blue-500/10 rounded px-2 py-0.5">
                        {p.document_number}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-blue-200/60">
                    {formatDate(p.report_date) || ""}
                    {p.prepared_by ? ` · Prepared by ${p.prepared_by}` : ""}
                  </p>
                  {p.findings.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(["Critical", "High", "Medium", "Low"] as const).map((sev) => {
                        const n = computeSummary(p.findings)[sev];
                        return n > 0 ? (
                          <span key={sev} className={`px-2 py-0.5 text-[10px] rounded-full border ${SEV_STYLES[sev]}`}>
                            {sev} {n}
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                  {p.pdf_public_id ? (
                    <Link
                      href={`/public/report/iso/${p.id}`}
                      className="mt-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-blue-600/25"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6V3m0 0L4.5 6m3-3 3 3m7.5 3H21v4.5" />
                      </svg>
                      View ISO Report
                    </Link>
                  ) : (
                    <span className="mt-auto px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-center text-xs text-blue-200/50">
                      PDF not published yet
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-5 flex items-center gap-3">
            <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
            Visit Reports
          </h2>
          {visits.length === 0 ? (
            <p className="text-blue-200/60">No visit reports have been published yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {visits.map((p) => (
                <div
                  key={p.id}
                  className="bg-gradient-to-br from-blue-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-blue-400/20 rounded-xl p-5 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className={`inline-block px-2 py-0.5 text-[10px] rounded-full border mb-2 ${branchColor.get(p.branch_id) || "bg-white/10 text-white/70 border-white/20"}`}>
                        {p.branch_name}
                      </span>
                      <h3 className="text-white font-semibold leading-snug">{p.purpose || "Visit Report"}</h3>
                    </div>
                    {p.status && (
                      <span className={`shrink-0 px-2 py-0.5 text-[10px] rounded-full ${VISIT_STATUS[p.status] || "bg-white/10 text-white/70"}`}>
                        {p.status}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-blue-200/60">
                    {p.visited_by ? `${p.visited_by} · ` : ""}
                    {formatDate(p.visit_date) || ""}
                  </p>
                  {p.pdf_public_id ? (
                    <Link
                      href={`/public/report/visit/${p.id}`}
                      className="mt-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-blue-600/25"
                    >
                      View Visit Report
                    </Link>
                  ) : (
                    <span className="mt-auto px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-center text-xs text-blue-200/50">
                      PDF not published yet
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}