import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { driveAccessToken, driveFolderId } from "@/lib/drive";

const MANAGEMENT_URL = "https://api.supabase.com/v1/projects/drmuaoxfkomjeqvbnexx/database/query";

async function requireUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

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
  const rows = json.value || [];
  return rows;
}

async function driveFiles(kind: string) {
  const folderId = driveFolderId(kind);
  if (!folderId) throw new Error("Google Drive folder is not configured.");
  const token = await driveAccessToken();
  const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,size,mimeType,createdTime,webViewLink,webContentLink)&orderBy=createdTime%20desc&pageSize=1000`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Drive files failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return (json.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    bytes: Number(f.size || 0),
    mimeType: f.mimeType,
    created_at: f.createdTime,
    url: f.webViewLink || f.webContentLink || "",
  }));
}

async function driveAbout() {
  const token = await driveAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/about?fields=storageQuota(limit,usage),user(displayName)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Drive about failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");
  try {
    if (source === "supabase") {
      const tables = await supabaseTables();
      return NextResponse.json({ tables });
    }
    if (source === "drive") {
      const kind = searchParams.get("folder") === "report" ? "report" : "plan";
      const [files, about] = await Promise.all([driveFiles(kind), driveAbout().catch(() => null)]);
      const bytes = files.reduce((sum: number, f: any) => sum + (f.bytes || 0), 0);
      return NextResponse.json({
        files,
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
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");
  if (source !== "drive") return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  const fileId = searchParams.get("fileId");
  if (!fileId) return NextResponse.json({ error: "Missing fileId" }, { status: 400 });

  try {
    const token = await driveAccessToken();
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