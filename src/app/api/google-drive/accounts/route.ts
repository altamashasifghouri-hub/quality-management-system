import { NextResponse } from "next/server";
import { revokeToken, supabaseFromCookies } from "@/lib/google-oauth";

export async function DELETE(req: Request) {
  const supabase = await supabaseFromCookies();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  let query = supabase.from("drive_accounts").select("id, refresh_token").eq("user_id", auth.user.id);
  if (id) query = query.eq("id", id);
  const { data: rows } = await query;

  for (const row of rows || []) {
    if (row.refresh_token) await revokeToken(row.refresh_token);
  }

  let del = supabase.from("drive_accounts").delete().eq("user_id", auth.user.id);
  if (id) del = del.eq("id", id);
  const { error } = await del;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ result: "ok", removed: (rows || []).length });
}
