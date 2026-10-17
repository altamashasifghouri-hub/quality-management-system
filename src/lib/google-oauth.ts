import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://qualityms.vercel.app";

export function nextAppUrl() {
  return APP_URL;
}

export function googleRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || `${APP_URL}/api/google-drive/callback`;
}

export interface OAuthClient {
  id: string;
  secret: string;
}

export function oauthClient(key: string = "default"): OAuthClient {
  if (key === "second") {
    return {
      id: process.env.GOOGLE_OAUTH2_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || "",
      secret: process.env.GOOGLE_OAUTH2_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
    };
  }
  return {
    id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || "",
  };
}

export function googleAuthUrl(state: string, clientKey: string = "default") {
  const params = new URLSearchParams({
    client_id: oauthClient(clientKey).id,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid",
    ].join(" "),
    access_type: "offline",
    prompt: "select_account consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function fetchGoogleEmail(accessToken: string): Promise<string> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return "";
    const info = await res.json();
    return info.email || "";
  } catch {
    return "";
  }
}

export function gmailAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCode(code: string, clientKey: string = "default") {
  const client = oauthClient(clientKey);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: client.id,
      client_secret: client.secret,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string, clientKey: string = "default") {
  const client = oauthClient(clientKey);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: client.id,
      client_secret: client.secret,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
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
        setAll(cookiesList: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesList.forEach(({ name, value, options }) =>
              (cookieStore as unknown as { set: (n: string, v: string, o?: any) => void }).set(name, value, options)
            );
          } catch {
            // cookies() is read-only outside route handlers/actions; refresh still works in-memory
          }
        },
      },
    }
  );
}