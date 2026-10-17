import { NextResponse } from "next/server";
import { revokeToken, supabaseFromCookies } from "@/lib/google-oauth";
import { provisionAccountFolders, refreshStoredQuota, resolveAccounts, setPreferredAccount } from "@/lib/drive-accounts";

export async function POST(req: Request) {
  const supabase = await supabaseFromCookies();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const action = String(body.action || "");
  const id = String(body.id || "");

  if (action === "prefer") {
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const ok = await setPreferredAccount(supabase, auth.user.id, id);
    if (!ok) return NextResponse.json({ error: "Could not set preferred drive." }, { status: 500 });
    return NextResponse.json({ result: "ok" });
  }

  if (action === "repair") {
    const accounts = await resolveAccounts(supabase, auth.user.id);
    const account = accounts.find((a) => a.id === id);
    if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    const provisioned = await provisionAccountFolders(supabase, account);
    const quota = await refreshStoredQuota(supabase, account);
    return NextResponse.json({ result: provisioned ? "ok" : "failed", quota });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

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
