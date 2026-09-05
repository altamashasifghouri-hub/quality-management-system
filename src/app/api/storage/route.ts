import { NextResponse } from "next/server";
import { getGoogleAccessToken, supabaseFromCookies } from "@/lib/google-oauth";
import { driveFolderId, driveListing } from "@/lib/drive";

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

async function driveAbout(token: string) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/about?fields=storageQuota(limit,usage)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  return res.json();
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

  const tokenResult = await getGoogleAccessToken(supabase);
  if (!tokenResult.connected) {
    return NextResponse.json({ connected: false }, { status: tokenResult.error === "Unauthorized" ? 401 : 200 });
  }
  const token = tokenResult.token;

  try {
    if (source === "drive") {
      const [plan, report, capa, about] = await Promise.all([
        driveListing(token, "plan"),
        driveListing(token, "report"),
        driveListing(token, "capa"),
        driveAbout(token).catch(() => null),
      ]);
      const bytes = [...plan, ...report, ...capa].reduce((sum: number, f: any) => sum + Number(f.bytes || 0), 0);
      return NextResponse.json({
        connected: true,
        folders: { plan, report, capa },
        storageBytes: bytes,
        storageLimit: Number(about?.storageQuota?.limit || 0),
        quotaUsage: Number(about?.storageQuota?.usage || 0),
      });
    }
    return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Storage query failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const supabase = await supabaseFromCookies();
  const tokenResult = await getGoogleAccessToken(supabase);
  if (!tokenResult.connected) {
    return NextResponse.json({ error: "Not connected to Google Drive" }, { status: 401 });
  }
  const token = tokenResult.token;

  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");
  if (source !== "drive") return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  const fileId = searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "Missing fileId" }, { status: 400 });

  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Drive delete failed: ${res.status} ${await res.text()}`);
    }
    return NextResponse.json({ result: "ok" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Delete failed" }, { status: 500 });
  }
}