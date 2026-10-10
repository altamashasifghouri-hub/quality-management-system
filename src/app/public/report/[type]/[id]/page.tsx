import Link from "next/link";
import QmsBrand from "@/components/QmsBrand";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SEVERITY_ORDER = ["Critical", "High", "Medium", "Low"] as const;
const SEV_STYLES: Record<string, string> = {
  Critical: "bg-red-500/15 text-red-300 border-red-400/30",
  High: "bg-orange-500/15 text-orange-300 border-orange-400/30",
  Medium: "bg-amber-500/15 text-amber-300 border-amber-400/30",
  Low: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
};

function fmt(d?: string | null) {
  if (!d) return "—";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

function asText(v: unknown): string {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

function toProxyImg(u?: unknown): string | null {
  if (typeof u !== "string" || !u) return null;
  try {
    const id = new URL(u).searchParams.get("id");
    if (id && /^[A-Za-z0-9_-]{10,}$/.test(id)) return `/api/report-file?kind=image&id=${encodeURIComponent(id)}`;
  } catch {
    /* ignore */
  }
  return null;
}

interface Finding {
  type?: string;
  clause?: string;
  department?: string;
  detail?: string;
  recommendation?: string;
  timeline?: number;
  resolved?: boolean;
  evidence?: unknown[];
}

function FindingCard({ f, n }: { f: Finding; n: number }) {
  const sev = SEVERITY_ORDER.find((s) => s === f.type) || f.type || "Medium";
  const resolved = !!f.resolved;
  const ev = (f.evidence || []).map(toProxyImg).filter(Boolean) as string[];
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs font-mono text-blue-200/50">#{String(n).padStart(2, "0")}</span>
        <span className={`px-2 py-0.5 text-[10px] rounded-full border ${SEV_STYLES[sev] || SEV_STYLES.Medium}`}>{sev}</span>
        <span className={`px-2 py-0.5 text-[10px] rounded-full border inline-flex items-center gap-1 ${
          resolved ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/40" : "bg-amber-500/15 text-amber-300 border-amber-400/40"
        }`}>
          {resolved ? (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
          ) : null}
          {resolved ? "Resolved" : "Open"}
        </span>
        {f.clause ? <span className="text-[10px] text-blue-200/50 font-mono">{f.clause}</span> : null}
        {f.department ? <span className="text-[10px] text-blue-200/50">{f.department}</span> : null}
        {typeof f.timeline === "number" ? (
          <span className="text-[10px] text-blue-200/50">Target: {f.timeline} day{f.timeline === 1 ? "" : "s"}</span>
        ) : null}
      </div>
      <p className="text-sm text-white/90 leading-relaxed whitespace-pre-line">{f.detail}</p>
      {asText(f.recommendation) ? (
        <p className="mt-3 text-xs text-blue-200/80 leading-relaxed">
          <span className="font-semibold text-blue-100">Recommendation: </span>
          {f.recommendation}
        </p>
      ) : null}
      {ev.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {ev.map((src, i) => (
            <img key={i} src={src} alt={`Evidence ${i + 1}`} loading="lazy" className="h-24 w-24 object-cover rounded-lg border border-white/10 bg-black/20" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default async function PublicReportView({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const supabase = await createClient();

  const { data: branches } = await supabase.from("branches").select("id,name");
  const branchName = new Map<string, string>((branches || []).map((b: any) => [b.id, b.name]));

  const notFound = (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl text-white font-semibold mb-3">Report not found</h1>
        <Link href="/public" className="text-blue-300 hover:text-blue-200 underline">Back to public view</Link>
      </div>
    </div>
  );

  const header = (
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
  );

  // ---------- ISO 9001 report ----------
  if (type === "iso") {
    const { data: p } = await supabase
      .from("audit_plans")
      .select("title,schedule_id,description,status,scope,objectives,criteria,audit_team,findings,nonconformities,overall_result,document_number,date_of_plan,prepared_by,signature,pdf_public_id")
      .eq("id", id)
      .maybeSingle();
    if (!p) return notFound;

    let branch = "—";
    if (p.schedule_id) {
      const { data: s } = await supabase.from("audit_schedules").select("branch_id").eq("id", p.schedule_id).maybeSingle();
      if (s?.branch_id && branchName.has(s.branch_id)) branch = branchName.get(s.branch_id)!;
    }

    const findings: Finding[] = Array.isArray(p.findings) ? p.findings : [];
    const summary: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    for (const f of findings) {
      const t = SEVERITY_ORDER.find((x) => x === f.type);
      if (t) summary[t] = (summary[t] || 0) + 1;
    }
    const resolvedCount = findings.filter((f) => f.resolved).length;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950">
        {header}
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <Link href="/public" className="inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200 transition-colors mb-5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to public view
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div className="min-w-0">
              <p className="text-xs text-blue-300/70 mb-1">{branch}{p.document_number ? ` · ${p.document_number}` : ""}</p>
              <h1 className="text-2xl font-bold text-white leading-snug break-words">{p.title || "ISO 9001 Audit Report"}</h1>
              <p className="text-sm text-blue-200/60 mt-1">
                {fmt(p.date_of_plan)}{p.prepared_by ? ` · Prepared by ${p.prepared_by}` : ""}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {p.overall_result ? (
                <span className="px-3 py-1 text-xs rounded-full border bg-blue-500/15 text-blue-200 border-blue-400/30">{p.overall_result}</span>
              ) : null}
              {p.pdf_public_id ? (
                <a
                  href={`/api/report-file?id=${encodeURIComponent(p.pdf_public_id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  Download
                </a>
              ) : null}
            </div>
          </div>

          {findings.length > 0 ? (
            <div className="mb-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
              {SEVERITY_ORDER.map((sev) => (
                <div key={sev} className={`rounded-xl border px-3 py-2.5 ${SEV_STYLES[sev]}`}>
                  <div className="text-xl font-bold">{summary[sev]}</div>
                  <div className="text-[11px] opacity-80">{sev}</div>
                </div>
              ))}
              <div className={`rounded-xl border px-3 py-2.5 ${resolvedCount > 0 ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/40" : "bg-amber-500/15 text-amber-300 border-amber-400/40"}`}>
                <div className="text-xl font-bold">{resolvedCount}/{findings.length}</div>
                <div className="text-[11px] opacity-80">{resolvedCount === findings.length && findings.length > 0 ? "All resolved" : "Resolved"}</div>
              </div>
            </div>
          ) : null}

          {(p.description || p.scope || p.objectives || asText(p.criteria) || p.audit_team) ? (
            <section className={`mb-8 ${findings.length > 0 ? "border-t border-white/10 pt-6" : ""}`}>
              <h2 className="text-sm font-semibold text-blue-200 uppercase tracking-wider mb-4">Overview</h2>
              <dl className="space-y-4 text-sm">
                {asText(p.description) ? <div><dt className="text-blue-200/60 mb-1">About this audit</dt><dd className="text-white/90 leading-relaxed whitespace-pre-line">{p.description}</dd></div> : null}
                {asText(p.scope) ? <div><dt className="text-blue-200/60 mb-1">Scope</dt><dd className="text-white/90 leading-relaxed whitespace-pre-line">{p.scope}</dd></div> : null}
                {asText(p.objectives) ? <div><dt className="text-blue-200/60 mb-1">Objectives</dt><dd className="text-white/90 leading-relaxed whitespace-pre-line">{p.objectives}</dd></div> : null}
                {asText(p.criteria) ? <div><dt className="text-blue-200/60 mb-1">Criteria</dt><dd className="text-white/90 leading-relaxed whitespace-pre-line">{p.criteria}</dd></div> : null}
                {asText(p.audit_team) ? <div><dt className="text-blue-200/60 mb-1">Audit team</dt><dd className="text-white/90 leading-relaxed whitespace-pre-line">{p.audit_team}</dd></div> : null}
              </dl>
            </section>
          ) : null}

          {findings.length > 0 ? (
            <section>
              <h2 className="text-sm font-semibold text-blue-200 uppercase tracking-wider mb-4">Findings</h2>
              <div className="space-y-4">
                {findings.map((f, i) => <FindingCard key={i} f={f} n={i + 1} />)}
              </div>
            </section>
          ) : (
            <p className="text-blue-200/60">No findings have been published for this report yet.</p>
          )}

          {p.signature && typeof p.signature === "string" && p.signature.startsWith("data:image") ? (
            <div className="mt-10 pt-6 border-t border-white/10 flex items-end justify-between">
              <div>
                <p className="text-xs text-blue-200/60">{p.prepared_by || "Prepared by"}</p>
                <p className="text-sm text-white/90 font-medium">Auditor</p>
              </div>
              <img src={p.signature} alt="Signature" className="h-14 object-contain" />
            </div>
          ) : null}
        </main>
      </div>
    );
  }

  // ---------- Visit record ----------
  if (type === "visit") {
    const { data: r } = await supabase
      .from("visit_records")
      .select("purpose,context,visit_date,branch_id,visited_by,status,observations,pdf_public_id")
      .eq("id", id)
      .maybeSingle();
    if (!r) return notFound;

    const obs = (Array.isArray(r.observations) ? r.observations : []) as any[];
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950">
        {header}
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <Link href="/public" className="inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200 transition-colors mb-5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to public view
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div className="min-w-0">
              <p className="text-xs text-blue-300/70 mb-1">{branchName.get(r.branch_id) || "—"}</p>
              <h1 className="text-2xl font-bold text-white leading-snug break-words">{r.purpose || "Visit Report"}</h1>
              <p className="text-sm text-blue-200/60 mt-1">
                {fmt(r.visit_date)}{r.visited_by ? ` · Visited by ${r.visited_by}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {r.status ? (
                <span className={`px-3 py-1 text-xs rounded-full border ${String(r.status).toLowerCase() === "completed" || String(r.status).toLowerCase() === "closed" ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/40" : "bg-amber-500/15 text-amber-300 border-amber-400/40"}`}>{r.status}</span>
              ) : null}
              {r.pdf_public_id ? (
                <a
                  href={`/api/report-file?id=${encodeURIComponent(r.pdf_public_id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  Download
                </a>
              ) : null}
            </div>
          </div>

          {asText(r.context) ? (
            <p className="text-sm text-white/90 leading-relaxed whitespace-pre-line mb-6 bg-white/[0.04] border border-white/10 rounded-xl p-4 sm:p-5">{r.context}</p>
          ) : null}

          {obs.length > 0 ? (
            <section>
              <h2 className="text-sm font-semibold text-blue-200 uppercase tracking-wider mb-4">Observations</h2>
              <div className="space-y-4">
                {obs.map((o, i) => {
                  const pics = (Array.isArray(o.pictures) ? o.pictures : []).map(toProxyImg).filter(Boolean) as string[];
                  return (
                    <div key={o.key || i} className="bg-white/[0.04] border border-white/10 rounded-xl p-4 sm:p-5">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-xs font-mono text-blue-200/50">#{String(i + 1).padStart(2, "0")}</span>
                        {o.area ? <span className="text-[10px] text-blue-200/50">{o.area}</span> : null}
                        {o.outcome ? <span className="px-2 py-0.5 text-[10px] rounded-full border bg-blue-500/15 text-blue-200 border-blue-400/30">{o.outcome}</span> : null}
                      </div>
                      <p className="text-sm text-white/90 leading-relaxed whitespace-pre-line">{o.context}</p>
                      {pics.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {pics.map((src, j) => (
                            <img key={j} src={src} alt={`Observation ${i + 1} photo ${j + 1}`} loading="lazy" className="h-24 w-24 object-cover rounded-lg border border-white/10 bg-black/20" />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <p className="text-blue-200/60">No observations recorded for this visit.</p>
          )}
        </main>
      </div>
    );
  }

  // ---------- Internal audit report ----------
  const { data: r } = await supabase
    .from("audit_reports")
    .select("title,document_number,branch_id,report_date,fieldwork_dates,report_period,locations_covered,prepared_by,background,objectives,positive_observations,overall_opinion,key_highlights,overall_conclusion,acknowledgement,findings,pdf_public_id")
    .eq("id", id)
    .maybeSingle();
  if (!r) return notFound;

  const branch = branchName.get(r.branch_id) || "—";
  const findings: Finding[] = Array.isArray(r.findings) ? r.findings : [];
  const summary: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  for (const f of findings) {
    const t = SEVERITY_ORDER.find((x) => x === f.type);
    if (t) summary[t] = (summary[t] || 0) + 1;
  }
  const resolvedCount = findings.filter((f) => f.resolved).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950">
      {header}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/public" className="inline-flex items-center gap-2 text-sm text-blue-300 hover:text-blue-200 transition-colors mb-5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
          Back to public view
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div className="min-w-0">
            <p className="text-xs text-blue-300/70 mb-1">{branch}{r.document_number ? ` · ${r.document_number}` : ""}</p>
            <h1 className="text-2xl font-bold text-white leading-snug break-words">{r.title || "Internal Audit Report"}</h1>
            <p className="text-sm text-blue-200/60 mt-1">
              {fmt(r.report_date)}
              {r.prepared_by ? ` · Prepared by ${r.prepared_by}` : ""}
              {r.fieldwork_dates ? ` · Fieldwork ${r.fieldwork_dates}` : ""}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            {r.pdf_public_id ? (
              <a
                href={`/api/report-file?id=${encodeURIComponent(r.pdf_public_id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                Download
              </a>
            ) : null}
          </div>
        </div>

        {findings.length > 0 ? (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-5 gap-3">
            {SEVERITY_ORDER.map((sev) => (
              <div key={sev} className={`rounded-xl border px-3 py-2.5 ${SEV_STYLES[sev]}`}>
                <div className="text-xl font-bold">{summary[sev]}</div>
                <div className="text-[11px] opacity-80">{sev}</div>
              </div>
            ))}
            <div className={`rounded-xl border px-3 py-2.5 ${resolvedCount > 0 ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/40" : "bg-amber-500/15 text-amber-300 border-amber-400/40"}`}>
              <div className="text-xl font-bold">{resolvedCount}/{findings.length}</div>
              <div className="text-[11px] opacity-80">{resolvedCount === findings.length && findings.length > 0 ? "All resolved" : "Resolved"}</div>
            </div>
          </div>
        ) : null}

        {(r.background || r.objectives || r.report_period || r.locations_covered || r.positive_observations || r.overall_opinion || r.key_highlights || r.overall_conclusion || r.acknowledgement) ? (
          <section className={`mb-8 ${findings.length > 0 ? "border-t border-white/10 pt-6" : ""}`}>
            <h2 className="text-sm font-semibold text-blue-200 uppercase tracking-wider mb-4">Overview</h2>
            <dl className="space-y-4 text-sm">
              {asText(r.background) ? <div><dt className="text-blue-200/60 mb-1">Background</dt><dd className="text-white/90 leading-relaxed whitespace-pre-line">{r.background}</dd></div> : null}
              {asText(r.objectives) ? <div><dt className="text-blue-200/60 mb-1">Objectives</dt><dd className="text-white/90 leading-relaxed whitespace-pre-line">{r.objectives}</dd></div> : null}
              {asText(r.report_period) ? <div><dt className="text-blue-200/60 mb-1">Reporting period</dt><dd className="text-white/90 leading-relaxed whitespace-pre-line">{r.report_period}</dd></div> : null}
              {asText(r.locations_covered) ? <div><dt className="text-blue-200/60 mb-1">Locations covered</dt><dd className="text-white/90 leading-relaxed whitespace-pre-line">{r.locations_covered}</dd></div> : null}
              {asText(r.positive_observations) ? <div><dt className="text-blue-200/60 mb-1">Positive observations</dt><dd className="text-white/90 leading-relaxed whitespace-pre-line">{r.positive_observations}</dd></div> : null}
              {asText(r.overall_opinion) ? <div><dt className="text-blue-200/60 mb-1">Overall opinion</dt><dd className="text-white/90 leading-relaxed whitespace-pre-line">{r.overall_opinion}</dd></div> : null}
              {asText(r.key_highlights) ? <div><dt className="text-blue-200/60 mb-1">Key highlights</dt><dd className="text-white/90 leading-relaxed whitespace-pre-line">{r.key_highlights}</dd></div> : null}
              {asText(r.overall_conclusion) ? <div><dt className="text-blue-200/60 mb-1">Conclusion</dt><dd className="text-white/90 leading-relaxed whitespace-pre-line">{r.overall_conclusion}</dd></div> : null}
              {asText(r.acknowledgement) ? <div><dt className="text-blue-200/60 mb-1">Acknowledgement</dt><dd className="text-white/90 leading-relaxed whitespace-pre-line">{r.acknowledgement}</dd></div> : null}
            </dl>
          </section>
        ) : null}

        {findings.length > 0 ? (
          <section>
            <h2 className="text-sm font-semibold text-blue-200 uppercase tracking-wider mb-4">Findings</h2>
            <div className="space-y-4">
              {findings.map((f, i) => <FindingCard key={i} f={f} n={i + 1} />)}
            </div>
          </section>
        ) : (
          <p className="text-blue-200/60">No findings have been published for this report yet.</p>
        )}
      </main>
    </div>
  );
}