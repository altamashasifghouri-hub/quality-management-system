import { NextResponse } from "next/server";
import { revokeToken, supabaseFromCookies } from "@/lib/google-oauth";

export async function POST() {
  const supabase = await supabaseFromCookies();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: row } = await supabase
    .from("google_oauth")
    .select("refresh_token")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (row?.refresh_token) await revokeToken(row.refresh_token);
  await supabase.from("google_oauth").delete().eq("user_id", data.user.id);

  return NextResponse.json({ result: "ok" });
}