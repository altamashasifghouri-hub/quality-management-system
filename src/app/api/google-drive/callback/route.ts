import { NextResponse } from "next/server";
import { exchangeCode, fetchGoogleEmail, nextAppUrl, supabaseFromCookies } from "@/lib/google-oauth";
import { provisionFolders } from "@/lib/drive-accounts";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state") || "";

  const isGmail = state.startsWith("gmail:");
  const isDrive2 = state.startsWith("drive2:");
  const clientKey = isDrive2 ? "second" : "default";
  const userId = isGmail ? state.slice("gmail:".length) : isDrive2 ? state.slice("drive2:".length) : state;
  const failTo = isGmail ? "/emails-management?connect=failed" : "/storage?connect=failed";
  const okTo = isGmail ? "/emails-management?connected=1" : "/storage?connected=1";

  if (!code) {
    return NextResponse.redirect(new URL(failTo, nextAppUrl()));
  }

  const supabase = await supabaseFromCookies();
  const { data } = await supabase.auth.getUser();
  if (!data?.user || data.user.id !== userId) {
    return NextResponse.redirect(new URL(failTo, nextAppUrl()));
  }

  try {
    const tokens = await exchangeCode(code, clientKey);
    if (!tokens?.access_token || !tokens?.refresh_token) {
      return NextResponse.redirect(new URL(failTo, nextAppUrl()));
    }

    if (isGmail) {
      let email = "";
      try {
        const who = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (who.ok) {
          const info = await who.json();
          email = info.email || "";
        }
      } catch {
        /* email lookup optional */
      }
      await supabase.from("gmail_accounts").upsert(
        {
          user_id: data.user.id,
          email: email || null,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    } else {
      const email = await fetchGoogleEmail(tokens.access_token);

      if (email) {
        await supabase
          .from("drive_accounts")
          .delete()
          .eq("user_id", data.user.id)
          .ilike("email", email);
      }

      const { data: existing } = await supabase
        .from("drive_accounts")
        .select("sort_order")
        .eq("user_id", data.user.id)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = existing?.length ? Number(existing[0].sort_order || 0) + 1 : 0;

      let folders: { plan: string; report: string; evidence: string; capa: string } | null = null;
      try {
        folders = await provisionFolders(tokens.access_token);
      } catch {
        folders = null;
      }

      await supabase.from("drive_accounts").insert({
        user_id: data.user.id,
        email: email || null,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
        plan_folder_id: folders?.plan || null,
        report_folder_id: folders?.report || null,
        evidence_folder_id: folders?.evidence || null,
        capa_folder_id: folders?.capa || null,
        client_key: clientKey,
        sort_order: nextOrder,
        updated_at: new Date().toISOString(),
      });
    }

    return NextResponse.redirect(new URL(okTo, nextAppUrl()));
  } catch {
    return NextResponse.redirect(new URL(failTo, nextAppUrl()));
  }
}
