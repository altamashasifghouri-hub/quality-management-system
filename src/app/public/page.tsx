import Link from "next/link";
import QmsBrand from "@/components/QmsBrand";
import PublicCapaTree, { PublicPlan } from "@/components/PublicCapaTree";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Plan = PublicPlan & {
  status?: string;
  pdf_url?: string;
};

export default async function PublicView() {
  const supabase = await createClient();
  const [{ data: audits }, { data: branches }, { data: schedules }] = await Promise.all([
    supabase.from("internal_audits").select("*").order("created_at", { ascending: false }),
    supabase.from("branches").select("id,name"),
    supabase.from("audit_schedules").select("id,branch_id"),
  ]);

  const branchName = new Map<string, string>((branches || []).map((r: any) => [r.id, r.name]));
  const schedBranch = new Map<string, string>((schedules || []).map((s: any) => [s.id, branchName.get(s.branch_id) || "Unassigned"]));

  const plans: Plan[] = (audits || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    branch_name: branchName.get(r.branch_id) || schedBranch.get(r.schedule_id) || "Unassigned",
    document_number: r.document_number,
    date_of_plan: r.date_of_plan,
    audit_period: r.audit_period,
    status: r.status,
    pdf_url: r.pdf_url || null,
    findings: r.findings || [],
  }));

  const auditReports = plans.filter((p) => p.pdf_url);
  const capaCount = plans.reduce((sum, p) => sum + p.findings.length, 0);

  const formatDate = (d?: string) =>
    d ? new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : null;

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
            Audit & Capa Reports
          </h1>
          <p className="text-lg text-blue-200/70 max-w-2xl mx-auto">
            Read-only access to audit findings and corrective action
            (CAPA) reports. {plans.length > 0 && (
              <span>
                {plans.length} audit {plans.length === 1 ? "plan" : "plans"} and {capaCount} finding{" "}
                {capaCount === 1 ? "" : "s"} are available.
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
          {auditReports.length === 0 ? (
            <p className="text-blue-200/60">No audit reports have been published yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {auditReports.map((p) => (
                <div
                  key={p.id}
                  className="bg-gradient-to-br from-blue-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-blue-400/20 rounded-xl p-5 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-blue-300/70 mb-1">{p.branch_name}</p>
                      <h3 className="text-white font-semibold leading-snug">{p.title}</h3>
                    </div>
                    {p.document_number && (
                      <span className="shrink-0 text-[11px] font-mono text-blue-200/60 border border-blue-400/25 bg-blue-500/10 rounded px-2 py-0.5">
                        {p.document_number}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-blue-200/60">
                    {formatDate(p.date_of_plan) || ""}
                    {p.audit_period ? ` · ${p.audit_period}` : ""}
                    {p.status ? ` · ${p.status}` : ""}
                  </p>
                  <a
                    href={p.pdf_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all duration-200 shadow-lg shadow-blue-600/25"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6V3m0 0L4.5 6m3-3 3 3m7.5 3H21v4.5" />
                    </svg>
                    View Audit Report
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-5 flex items-center gap-3">
            <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            CAPA Reports
          </h2>
{capaCount === 0 ? (
            <p className="text-blue-200/60">No audit findings have been published yet.</p>
          ) : (
            <PublicCapaTree plans={plans} />
          )}
        </section>
      </main>
    </div>
  );
}