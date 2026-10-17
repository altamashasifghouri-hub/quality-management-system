import { NextResponse } from "next/server";
import { supabaseFromCookies } from "@/lib/google-oauth";
import { driveListing } from "@/lib/drive";
import { refreshStoredQuota, resolveAccounts } from "@/lib/drive-accounts";

const MANAGEMENT_URL = "https://api.supabase.com/v1/projects/drmuaoxfkomjeqvbnexx/database/query";

async function supabaseTables() {
  const sql = `SELECT c.relname AS table_name,
      pg_total_relation_size(c.oid) AS total_bytes,
      s.n_live_tup AS approximate_rows,
      (SELECT pg_database_size(current_database())) AS db_bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY total_bytes DESC;`;
  const res = await fetch(MANAGEMENT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_MANAGEMENT_TOKEN || ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`Supabase query failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.value || [];
}

export async function GET(req: Request) {
  const supabase = await supabaseFromCookies();
  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");

  if (source === "supabase") {
    try {
      const tables = await supabaseTables();
      return NextResponse.json({ tables });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Storage query failed" }, { status: 500 });
    }
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ connected: false }, { status: 401 });

  const accounts = await resolveAccounts(supabase, auth.user.id);
  if (!accounts.length) return NextResponse.json({ connected: false });

  try {
    if (source === "drive") {
      const aggFolders: { plan: any[]; report: any[]; capa: any[] } = { plan: [], report: [], capa: [] };
      let storageBytes = 0;
      let storageLimit = 0;
      let quotaUsage = 0;

      const accountsOut = await Promise.all(
        accounts.map(async (account, index) => {
          const label = account.email || (index === 0 ? "Main account" : `Drive ${index + 1}`);
          const quota = await refreshStoredQuota(supabase, account);
          const [plan, report, capa] = await Promise.all([
            driveListing(account.token, account.plan_folder_id || "").catch(() => []),
            driveListing(account.token, account.report_folder_id || "").catch(() => []),
            driveListing(account.token, account.capa_folder_id || "").catch(() => []),
          ]);
          const tag = (files: any[]) => files.map((f) => ({ ...f, accountId: account.id, accountLabel: label }));
          aggFolders.plan.push(...tag(plan));
          aggFolders.report.push(...tag(report));
          aggFolders.capa.push(...tag(capa));
          const bytes = [...plan, ...report, ...capa].reduce((sum, f) => sum + Number(f.bytes || 0), 0);
          storageBytes += bytes;
          storageLimit += quota.limit;
          quotaUsage += quota.usage;
          return {
            id: account.id,
            email: account.email,
            label,
            sortOrder: account.sort_order,
            clientKey: account.client_key || "default",
            storageBytes: bytes,
            quotaUsage: quota.usage,
            quotaLimit: quota.limit,
            folderIds: {
              plan: account.plan_folder_id,
              report: account.report_folder_id,
              evidence: account.evidence_folder_id,
              capa: account.capa_folder_id,
            },
            counts: { plan: plan.length, report: report.length, capa: capa.length },
          };
        })
      );

      return NextResponse.json({
        connected: true,
        accounts: accountsOut,
        folders: aggFolders,
        storageBytes,
        storageLimit,
        quotaUsage,
      });
    }
    return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Storage query failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const supabase = await supabaseFromCookies();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");
  if (source !== "drive") return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  const fileId = searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "Missing fileId" }, { status: 400 });

  const accounts = await resolveAccounts(supabase, auth.user.id);
  let lastError = "Delete failed";
  for (const account of accounts) {
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${account.token}` },
      });
      if (res.ok || res.status === 404) return NextResponse.json({ result: "ok" });
      lastError = `Drive delete failed: ${res.status}`;
    } catch (e: any) {
      lastError = e?.message || lastError;
    }
  }
  return NextResponse.json({ error: lastError }, { status: 500 });
}
