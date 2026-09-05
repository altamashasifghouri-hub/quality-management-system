import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const CLOUD_NAME = "dwwjiiic";
const MANAGEMENT_URL = "https://api.supabase.com/v1/projects/drmuaoxfkomjeqvbnexx/database/query";

function cloudinaryBasic() {
  const key = process.env.CLOUDINARY_API_KEY || "";
  const secret = process.env.CLOUDINARY_API_SECRET || "";
  return "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
}

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

async function cloudinaryUsage() {
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/usage`, {
    headers: { Authorization: cloudinaryBasic() },
  });
  if (!res.ok) throw new Error(`Cloudinary usage failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function cloudinaryResources() {
  const endpoints = [
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/image?max_results=500`,
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/raw?max_results=500`,
  ];
  const results = await Promise.all(
    endpoints.map(async (url) => {
      const res = await fetch(url, { headers: { Authorization: cloudinaryBasic() } });
      if (!res.ok) throw new Error(`Cloudinary resources failed: ${res.status} ${await res.text()}`);
      const json = await res.json();
      return json.resources || [];
    })
  );
  return results.flat().sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""));
}

async function cloudinaryDelete(resourceType: string, publicId: string) {
  const apiKey = process.env.CLOUDINARY_API_KEY || "";
  const apiSecret = process.env.CLOUDINARY_API_SECRET || "";
  const timestamp = Math.round(Date.now() / 1000);
  const params = `public_id=${publicId}&timestamp=${timestamp}&type=upload`;
  const signature = createHash("sha1").update(`${params}${apiSecret}`).digest("hex");
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: apiKey,
    signature,
    type: "upload",
  });
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/destroy`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }
  );
  if (!res.ok) throw new Error(`Cloudinary delete failed: ${res.status} ${await res.text()}`);
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
    if (source === "cloudinary") {
      const [usage, resources] = await Promise.all([cloudinaryUsage(), cloudinaryResources()]);
      return NextResponse.json({ usage, resources });
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
  if (source !== "cloudinary") return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  const resourceType = searchParams.get("resourceType") || "image";
  const publicId = searchParams.get("publicId");
  if (!publicId) return NextResponse.json({ error: "Missing publicId" }, { status: 400 });

  try {
    const result = await cloudinaryDelete(resourceType, publicId);
    return NextResponse.json({ result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Delete failed" }, { status: 500 });
  }
}