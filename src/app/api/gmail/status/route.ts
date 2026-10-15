import { NextResponse } from "next/server";
import { supabaseFromCookies } from "@/lib/google-oauth";

export async function GET() {
  const supabase = await supabaseFromCookies();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  const userEmail = userData?.user?.email || "";

  const { data } = await supabase.from("gmail_accounts").select("*").maybeSingle();
  if (!data) return NextResponse.json({ connected: false });

  const viewers = Array.isArray(data.viewers) ? (data.viewers as string[]) : [];
  const isOwner = userId ? data.user_id === userId : false;
  const allowed = isOwner || (userEmail && viewers.includes(userEmail)) || Boolean(data.is_public);
  return NextResponse.json({
    connected: true,
    connectedBy: data.user_id,
    email: data.email,
    senderFilter: data.sender_filter || "",
    viewers,
    isOwner,
    allowed,
    isPublic: Boolean(data.is_public),
  });
}
