import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const FOLDER = "audit_plans";

export async function POST() {
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
  if (!data?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.CLOUDINARY_API_KEY || "";
  const apiSecret = process.env.CLOUDINARY_API_SECRET || "";
  const timestamp = Math.round(Date.now() / 1000);
  const params = `folder=${FOLDER}&timestamp=${timestamp}`;
  const signature = createHash("sha1").update(`${params}${apiSecret}`).digest("hex");

  return NextResponse.json({ api_key: apiKey, timestamp, signature, folder: FOLDER });
}