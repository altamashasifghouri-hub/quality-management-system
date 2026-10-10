import Link from "next/link";
import QmsBrand from "@/components/QmsBrand";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function fmt(d?: string | null) {
  if (!d) return "—";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

export default async function PublicReportView({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const supabase = await createClient();

  const { data: branches } = await supabase.from("branches").select("id,name");
  const branchName = new Map<string, string>((branches || []).map((b: any) => [b.id, b.name]));

  let title = "";
  let docNo = "";
  let branch = "";
  let date = "";
  let by = "";
  let fileId: string | null = null;

  if (type === "iso") {
    const { data: rows } = await supabase.from("audit_plans").select("title,document_number,schedule_id,date_of_plan,prepared_by,pdf_public_id").eq("id", id).maybeSingle();
    if (rows) {
      title = rows.title || "";
      docNo = rows.document_number || "";
      date = fmt(rows.date_of_plan);
      by = rows.prepared_by || "";
      fileId = rows.pdf_public_id || null;
      if (rows.schedule_id) {
        const { data: s } = await supabase.from("audit_schedules").select("branch_id").eq("id", rows.schedule_id).maybeSingle();
        branch = branchName.get(s?.branch_id) || "—";
      }
    }
  } else if (type === "visit") {
    const { data: rows } = await supabase.from("visit_records").select("purpose,visit_date,branch_id,visited_by,pdf_public_id").eq("id", id).maybeSingle();
    if (rows) {
      title = rows.purpose || "Visit Report";
      docNo = "QMS/VE";
      date = fmt(rows.visit_date);
      by = rows.visited_by || "";
      fileId = rows.pdf_public_id || null;
      branch = branchName.get(rows.branch_id) || "—";
    }
  } else {
    const { data: rows } = await supabase.from("audit_reports").select("title,document_number,branch_id,report_date,prepared_by,pdf_public_id").eq("id", id).maybeSingle();
    if (rows) {
      title = rows.title || "";
      docNo = rows.document_number || "";
      date = fmt(rows.report_date);
      by = rows.prepared_by || "";
      fileId = rows.pdf_public_id || null;
      branch = branchName.get(rows.branch_id) || "—";
    }
  }

  if (!title && !fileId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl text-white font-semibold mb-3">Report not found</h1>
          <Link href="/public" className="text-blue-300 hover:text-blue-200 underline">Back to public view</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950">
      <nav className="border-b border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/public" className="flex items-center gap-3">
            <QmsBrand compact />
            <span className="text-white font-semibold">Quality Management System</span>
          </Link>
          <Link href="/auth/signin" className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all duration-200">
            Sign In
          </Link>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/public" className="inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200 transition-colors mb-5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
          Back to public view
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <p className="text-xs text-blue-300/70 mb-1">{branch}{docNo ? ` · ${docNo}` : ""}</p>
            <h1 className="text-2xl font-bold text-white leading-snug break-words">{title}</h1>
            <p className="text-sm text-blue-200/60 mt-1">{date}{by ? ` · Prepared by ${by}` : ""}</p>
          </div>
          {fileId && (
            <a
              href={`/api/report-file?id=${encodeURIComponent(fileId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6V3m0 0L4.5 6m3-3 3 3m7.5 3H21v4.5" /></svg>
              Open &amp; Download
            </a>
          )}
        </div>

        {fileId ? (
          <iframe
            src={`/api/report-file?id=${encodeURIComponent(fileId)}`}
            title={title || "Report"}
            className="w-full h-[78vh] rounded-xl border border-white/10 bg-white"
          />
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center text-blue-200/60">
            PDF not published yet.
          </div>
        )}
      </main>
    </div>
  );
}