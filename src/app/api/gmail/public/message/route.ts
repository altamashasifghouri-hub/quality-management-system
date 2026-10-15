import { NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/google-oauth";
import { collectAttachments, decodeBase64UrlUtf8, decodeMimeHeader, extractBodies, stripHtml } from "@/lib/gmail-message";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const { data: acct } = await supabase.from("gmail_accounts").select("*").eq("is_public", true).maybeSingle();
  if (!acct) return NextResponse.json({ ok: false }, { status: 404 });

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

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return NextResponse.json({ ok: false, status: res.status }, { status: res.status });

  const j = await res.json();
  const headers: Record<string, string> = {};
  (j.payload?.headers || []).forEach((h: any) => (headers[h.name] = h.value));

  const { plain, html } = extractBodies(j.payload);
  const body = plain ? decodeBase64UrlUtf8(plain) : stripHtml(decodeBase64UrlUtf8(html));
  const attachments = collectAttachments(j.payload);

  return NextResponse.json({
    ok: true,
    id: j.id,
    threadId: j.threadId,
    from: decodeMimeHeader(headers.From || ""),
    to: decodeMimeHeader(headers.To || ""),
    subject: decodeMimeHeader(headers.Subject || ""),
    date: headers.Date || "",
    body,
    attachments,
  });
}
