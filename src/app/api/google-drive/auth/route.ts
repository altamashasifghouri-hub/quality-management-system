import { NextResponse } from "next/server";
import { googleAuthUrl, nextAppUrl, supabaseFromCookies } from "@/lib/google-oauth";

export async function GET(req: Request) {
  const supabase = await supabaseFromCookies();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return NextResponse.redirect(new URL("/auth/signin", nextAppUrl()));
  const { searchParams } = new URL(req.url);
  const clientKey = searchParams.get("client") === "second" ? "second" : "default";
  const state = clientKey === "second" ? `drive2:${data.user.id}` : data.user.id;
  return NextResponse.redirect(googleAuthUrl(state, clientKey));
}
