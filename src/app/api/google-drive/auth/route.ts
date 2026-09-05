import { NextResponse } from "next/server";
import { googleAuthUrl, nextAppUrl, supabaseFromCookies } from "@/lib/google-oauth";

export async function GET() {
  const supabase = await supabaseFromCookies();
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return NextResponse.redirect(new URL("/auth/signin", nextAppUrl()));
  return NextResponse.redirect(googleAuthUrl(data.user.id));
}