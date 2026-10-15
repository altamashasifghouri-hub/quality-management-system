import { NextResponse } from "next/server";
import { refreshAccessToken, supabaseFromCookies } from "@/lib/google-oauth";
import { buildGmailQuery } from "@/lib/gmail-query";
import { decodeMimeHeader } from "@/lib/gmail-message";

export async function GET(req: Request) {
  const supabase = await supabaseFromCookies();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return NextResponse.json({ ok: false }, { status: 401 });

  const url = new URL(req.url);
  const pageToken = url.searchParams.get("pageToken") || "";
  const { data: acct } = await supabase.from("gmail_accounts").select("*").maybeSingle();
  if (!acct) return NextResponse.json({ ok: false, connected: false }, { status: 404 });

  const userId = userData.user.id;
  const userEmail = userData.user.email || "";
  const viewers = Array.isArray(acct.viewers) ? (acct.viewers as string[]) : [];
  const allowed = acct.user_id === userId || (userEmail && viewers.includes(userEmail));
  if (!allowed) return NextResponse.json({ ok: false, allowed: false }, { status: 403 });

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

  const q = buildGmailQuery(acct.sender_filter || "");
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("maxResults", "20");
  if (q) listUrl.searchParams.set("q", q);
  if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

  const listRes = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!listRes.ok) {
    let errMessage = "";
    let reason = "";
    try {
      const ej: any = await listRes.json();
      errMessage = ej?.error?.message || "";
      reason = ej?.error?.errors?.[0]?.reason || ej?.error?.status || "";
    } catch {
      errMessage = await listRes.text().catch(() => "");
    }
    return NextResponse.json({ ok: false, status: listRes.status, reason, error: errMessage }, { status: listRes.status });
  }
  const list = await listRes.json();
  const messages = Array.isArray(list.messages) ? list.messages : [];

  const items = await Promise.all(
    messages.map(async (m: any) => {
      try {
        const mu = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}`);
        mu.searchParams.set("format", "metadata");
        for (const h of ["From", "To", "Subject", "Date"]) mu.searchParams.append("metadataHeaders", h);
        const res = await fetch(mu.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return null;
        const j = await res.json();
        const headers: Record<string, string> = {};
        (j.payload?.headers || []).forEach((h: any) => (headers[h.name] = h.value));
        return {
          id: m.id,
          threadId: j.threadId,
          snippet: j.snippet,
          from: decodeMimeHeader(headers.From || ""),
          to: decodeMimeHeader(headers.To || ""),
          subject: decodeMimeHeader(headers.Subject || ""),
          date: headers.Date || "",
          internalDate: j.internalDate,
          unread: Array.isArray(j.labelIds) ? j.labelIds.includes("UNREAD") : false,
        };
      } catch {
        return null;
      }
    })
  );

  return NextResponse.json({
    ok: true,
    messages: items.filter(Boolean),
    nextPageToken: list.nextPageToken || null,
  });
}
