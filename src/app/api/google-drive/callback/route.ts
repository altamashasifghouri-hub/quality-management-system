import { NextResponse } from "next/server";
import { exchangeCode, nextAppUrl, supabaseFromCookies } from "@/lib/google-oauth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code) {
    return NextResponse.redirect(new URL("/storage?connect=failed", nextAppUrl()));
  }

  const supabase = await supabaseFromCookies();
  const { data } = await supabase.auth.getUser();
  if (!data?.user || data.user.id !== state) {
    return NextResponse.redirect(new URL("/storage?connect=failed", nextAppUrl()));
  }

  try {
    const tokens = await exchangeCode(code);
    if (!tokens?.access_token || !tokens?.refresh_token) {
      return NextResponse.redirect(new URL("/storage?connect=failed", nextAppUrl()));
    }
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
    return NextResponse.redirect(new URL("/storage?connected=1", nextAppUrl()));
  } catch {
    return NextResponse.redirect(new URL("/storage?connect=failed", nextAppUrl()));
  }
}