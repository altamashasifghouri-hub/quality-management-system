import { NextResponse } from "next/server";
import { supabaseFromCookies } from "@/lib/google-oauth";

export async function POST() {
  const supabase = await supabaseFromCookies();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return NextResponse.json({ ok: false }, { status: 401 });
  await supabase.from("gmail_accounts").delete().eq("user_id", data.user.id);
  return NextResponse.json({ ok: true });
}
