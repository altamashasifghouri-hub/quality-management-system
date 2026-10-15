import { NextResponse } from "next/server";
import { refreshAccessToken, supabaseFromCookies } from "@/lib/google-oauth";

export async function GET(req: Request) {
  const supabase = await supabaseFromCookies();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(req.url);
  const messageId = url.searchParams.get("messageId") || "";
  const attachmentId = url.searchParams.get("id") || "";
  const filename = url.searchParams.get("filename") || "attachment";
  const mimeType = url.searchParams.get("mime") || "application/octet-stream";
  const download = url.searchParams.get("download") === "1";
  if (!messageId || !attachmentId) return NextResponse.json({ ok: false }, { status: 400 });

  const { data: acct } = await supabase.from("gmail_accounts").select("*").maybeSingle();
  if (!acct) return NextResponse.json({ ok: false }, { status: 404 });

  const userId = userData.user.id;
  const userEmail = userData.user.email || "";
  const viewers = Array.isArray(acct.viewers) ? (acct.viewers as string[]) : [];
  const allowed = acct.user_id === userId || (userEmail && viewers.includes(userEmail));
  if (!allowed) return NextResponse.json({ ok: false }, { status: 403 });

  let accessToken = acct.access_token;
  if (!accessToken) return NextResponse.json({ ok: false }, { status: 400 });

  if (acct.expires_at && new Date(acct.expires_at).getTime() < Date.now() - 30 * 1000) {
    if (acct.refresh_token) {
      const r = await refreshAccessToken(acct.refresh_token);
      if (r?.access_token) {
        accessToken = r.access_token;
        await supabase
          .from("gmail_accounts")
          .update({
            access_token: r.access_token,
            expires_at: new Date(Date.now() + Number(r.expires_in || 3600) * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", acct.user_id);
      } else {
        return NextResponse.json({ ok: false, needsReconnect: true }, { status: 401 });
      }
    }
  }

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return NextResponse.json({ ok: false, status: res.status }, { status: res.status });

  const j = await res.json();
  const buf = Buffer.from(j.data || "", "base64url");

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
