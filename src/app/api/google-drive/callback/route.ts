import { NextResponse } from "next/server";
import { exchangeCode, nextAppUrl, supabaseFromCookies } from "@/lib/google-oauth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state") || "";

  const isGmail = state.startsWith("gmail:");
  const userId = isGmail ? state.slice("gmail:".length) : state;
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
    const tokens = await exchangeCode(code);
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
      await supabase.from("google_oauth").upsert(
        {
          user_id: data.user.id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }

    return NextResponse.redirect(new URL(okTo, nextAppUrl()));
  } catch {
    return NextResponse.redirect(new URL(failTo, nextAppUrl()));
  }
}
