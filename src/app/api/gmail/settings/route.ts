import { NextResponse } from "next/server";
import { supabaseFromCookies } from "@/lib/google-oauth";

export async function POST(req: Request) {
  const supabase = await supabaseFromCookies();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sender_filter = (body.sender_filter || "").trim() || null;
  const viewers = Array.isArray(body.viewers) ? body.viewers.filter((v: any) => typeof v === "string" && v.includes("@")) : [];
  const is_public = Boolean(body.is_public);

  const { error } = await supabase
    .from("gmail_accounts")
    .update({ sender_filter, viewers, is_public, updated_at: new Date().toISOString() })
    .eq("user_id", data.user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
