import type { SupabaseClient } from "@supabase/supabase-js";

export interface TodayAudit {
  branch: string;
  auditor: string;
  detail: string;
  status: string;
}

export function localDateString(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getTodayAudits(supabase: SupabaseClient, date: string): Promise<TodayAudit[]> {
  const [{ data: branches }, { data: schedules }] = await Promise.all([
    supabase.from("branches").select("id,name"),
    supabase
      .from("audit_schedules")
      .select("id,branch_id,auditor,date_from,date_to,status")
      .lte("date_from", date)
      .or(`date_to.gte.${date},date_to.is.null`),
  ]);

  const branchName = new Map<string, string>((branches || []).map((b: any) => [b.id, b.name]));

  const items: TodayAudit[] = (schedules || []).map((s: any) => ({
    branch: branchName.get(s.branch_id) || "—",
    auditor: (s.auditor || "").trim() || "Unassigned",
    detail: s.date_from && s.date_to && s.date_from !== s.date_to ? `${s.date_from} → ${s.date_to}` : "",
    status: s.status || "",
  }));

  items.sort((a, b) => a.branch.localeCompare(b.branch));
  return items;
}
