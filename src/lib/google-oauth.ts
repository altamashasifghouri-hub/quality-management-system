import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://qualityms.vercel.app";

export function nextAppUrl() {
  return APP_URL;
}

export function googleRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || `${APP_URL}/api/google-drive/callback`;
}

export function googleAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
      "openid",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function revokeToken(refreshToken: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST" }).catch(() => {});
}

export async function supabaseFromCookies() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

export async function getGoogleAccessToken(supabase: any) {
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) return { connected: false as const, error: "Unauthorized" as const };

  const { data: row } = await supabase
    .from("google_oauth")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row) return { connected: false as const, error: "not_connected" as const };

  if (new Date(row.expires_at).getTime() > Date.now() + 60000) {
    return { connected: true as const, token: row.access_token as string };
  }

  const refreshed = await refreshAccessToken(row.refresh_token);
  if (!refreshed?.access_token) return { connected: false as const, error: "refresh_failed" as const };

  await supabase
    .from("google_oauth")
    .update({
      access_token: refreshed.access_token,
      expires_at: new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);
  return { connected: true as const, token: refreshed.access_token as string };
}