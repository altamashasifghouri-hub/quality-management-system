import Link from "next/link";
import QmsBrand from "@/components/QmsBrand";
import PublicTodayAudit from "@/components/PublicTodayAudit";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BRANCH_ACCENTS = [
  "from-emerald-500/20 to-emerald-500/0 border-emerald-500/30",
  "from-teal-500/20 to-teal-500/0 border-teal-500/30",
  "from-amber-500/20 to-amber-500/0 border-amber-500/30",
  "from-purple-500/20 to-purple-500/0 border-purple-500/30",
  "from-rose-500/20 to-rose-500/0 border-rose-500/30",
  "from-cyan-500/20 to-cyan-500/0 border-cyan-500/30",
  "from-orange-500/20 to-orange-500/0 border-orange-500/30",
];

export default async function PublicView() {
  const supabase = await createClient();
  const [{ data: branches }, { data: auditReports }, { data: isoPlans }, { data: schedules }, { data: visitRecords }, { data: publicMailboxes }] = await Promise.all([
    supabase.from("branches").select("id,name").order("name"),
    supabase.from("audit_reports").select("id,branch_id"),
    supabase.from("audit_plans").select("id,schedule_id"),
    supabase.from("audit_schedules").select("id,branch_id"),
    supabase.from("visit_records").select("id,branch_id"),
    supabase.from("gmail_accounts").select("email").eq("is_public", true).limit(1),
  ]);

  const schedBranch = new Map<string, string>((schedules || []).map((s: any) => [s.id, s.branch_id]));

  const auditCount = new Map<string, number>();
  for (const r of auditReports || []) {
    if (r.branch_id) auditCount.set(r.branch_id, (auditCount.get(r.branch_id) || 0) + 1);
  }
  for (const p of isoPlans || []) {
    const bid = p.schedule_id ? schedBranch.get(p.schedule_id) : "";
    if (bid) auditCount.set(bid, (auditCount.get(bid) || 0) + 1);
  }

  const visitCount = new Map<string, number>();
  for (const r of visitRecords || []) {
    if (r.branch_id) visitCount.set(r.branch_id, (visitCount.get(r.branch_id) || 0) + 1);
  }

  const tiles = (branches || []).map((b: any, i: number) => ({
    id: b.id,
    name: b.name,
    audits: auditCount.get(b.id) || 0,
    visits: visitCount.get(b.id) || 0,
    accent: BRANCH_ACCENTS[i % BRANCH_ACCENTS.length],
  }));

  const totalAudits = auditCount.size ? [...auditCount.values()].reduce((a, b) => a + b, 0) : 0;
  const totalVisits = visitCount.size ? [...visitCount.values()].reduce((a, b) => a + b, 0) : 0;

  const hasPublicMailbox = (publicMailboxes || []).length > 0;

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
            Branch Reports
          </h1>
          <p className="text-lg text-blue-200/70 max-w-2xl mx-auto">
            Read-only access to published audit and visit reports.
            {tiles.length > 0 && (
              <span className="block text-base mt-2">
                {tiles.length} branch{tiles.length === 1 ? "" : "es"} · {totalAudits} audit report{totalAudits === 1 ? "" : "s"} · {totalVisits} visit report{totalVisits === 1 ? "" : "s"} available.
              </span>
            )}
          </p>
        </div>

        {tiles.length === 0 && !hasPublicMailbox ? (
          <p className="text-center text-blue-200/60">No branches have been set up yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {hasPublicMailbox && (
              <Link
                href="/public/emails"
                className="group bg-gradient-to-br from-purple-500/20 to-purple-500/0 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-purple-500/30 rounded-xl p-5 flex flex-col gap-4 ring-1 ring-white/5 hover:ring-purple-400/40 hover:-translate-y-0.5 transition-all duration-200"
              >
                <div className="flex items-center gap-3">
                  <span className="w-11 h-11 shrink-0 rounded-lg bg-white/10 border border-white/15 grid place-items-center text-purple-200">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                    </svg>
                  </span>
                  <h3 className="text-white font-semibold leading-snug break-words">Emails</h3>
                </div>
                <span className="mt-auto inline-flex items-center gap-2 text-sm text-purple-300 group-hover:text-purple-200 font-medium">
                  View emails
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </span>
              </Link>
            )}
            {tiles.map((b) => (
              <Link
                key={b.id}
                href={`/public/branch/${b.id}`}
                className={`group bg-gradient-to-br ${b.accent} via-slate-800/30 to-slate-900/50 backdrop-blur-md border rounded-xl p-5 flex flex-col gap-4 ring-1 ring-white/5 hover:ring-blue-400/40 hover:-translate-y-0.5 transition-all duration-200`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-11 h-11 shrink-0 rounded-lg bg-white/10 border border-white/15 grid place-items-center text-blue-200">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                    </svg>
                  </span>
                  <h3 className="text-white font-semibold leading-snug break-words">{b.name}</h3>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <span className={`px-2 py-0.5 text-[10px] rounded-full border ${b.audits > 0 ? "bg-blue-500/15 text-blue-200 border-blue-400/30" : "bg-white/5 text-blue-200/40 border-white/10"}`}>
                    {b.audits} audit report{b.audits === 1 ? "" : "s"}
                  </span>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full border ${b.visits > 0 ? "bg-emerald-500/15 text-emerald-200 border-emerald-400/30" : "bg-white/5 text-blue-200/40 border-white/10"}`}>
                    {b.visits} visit report{b.visits === 1 ? "" : "s"}
                  </span>
                </div>

                <span className="mt-auto inline-flex items-center gap-2 text-sm text-blue-300 group-hover:text-blue-200 font-medium">
                  View reports
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
