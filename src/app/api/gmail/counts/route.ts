import { NextResponse } from "next/server";
import { refreshAccessToken, supabaseFromCookies } from "@/lib/google-oauth";
import { buildGmailQuery } from "@/lib/gmail-query";

async function countFor(accessToken: string, q: string): Promise<number> {
  let token = "";
  let count = 0;
  let pages = 0;
  do {
    const u = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    u.searchParams.set("maxResults", "500");
    u.searchParams.set("fields", "messages/id,nextPageToken");
    if (q) u.searchParams.set("q", q);
    if (token) u.searchParams.set("pageToken", token);
    const res = await fetch(u.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return count > 0 ? count : -1;
    let j: any = {};
    try {
      j = await res.json();
    } catch {
      j = {};
    }
    count += Array.isArray(j.messages) ? j.messages.length : 0;
    token = j.nextPageToken || "";
    pages += 1;
  } while (token && pages < 40);
  return count;
}

export async function GET() {
  const supabase = await supabaseFromCookies();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return NextResponse.json({ ok: false }, { status: 401 });

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

  const base = buildGmailQuery(acct.sender_filter || "");
  const join = (extra: string) => (base ? `${base} ${extra}` : extra);

  const total = await countFor(accessToken, base);
  if (total < 0) return NextResponse.json({ ok: false, status: 403 }, { status: 403 });
  const unread = await countFor(accessToken, join("is:unread"));
  const recent = await countFor(accessToken, join("newer_than:1d"));

  return NextResponse.json({
    ok: true,
    total,
    unread: unread < 0 ? 0 : unread,
    read: unread < 0 ? total : Math.max(total - unread, 0),
    recent: recent < 0 ? 0 : recent,
  });
}
