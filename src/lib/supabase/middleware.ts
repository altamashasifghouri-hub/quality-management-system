import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/public") &&
    !request.nextUrl.pathname.startsWith("/api/report-file") &&
    !request.nextUrl.pathname.startsWith("/api/today-schedule") &&
    !request.nextUrl.pathname.startsWith("/api/gmail/public") &&
    !request.nextUrl.pathname.startsWith("/api/settings/public-pin/check") &&
    !request.nextUrl.pathname.startsWith("/api/settings/public-pin/status") &&
    request.nextUrl.pathname !== "/"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/signin";
    return NextResponse.redirect(url);
  }

  // Public PIN gate for /public pages (except /public/auth). Applies to EVERYONE, logged in or not.
  if (
    request.nextUrl.pathname.startsWith("/public") &&
    !request.nextUrl.pathname.startsWith("/public/auth")
  ) {
    const token = await getPublicPinToken();
    if (token) {
      const cookie = request.cookies.get("qms_public_pin")?.value;
      if (cookie !== token) {
        const url = request.nextUrl.clone();
        url.pathname = "/public/auth";
        url.searchParams.set("next", request.nextUrl.pathname);
        return NextResponse.redirect(url);
      }
    }
  }

  // Public data APIs used by the public portal must also respect the PIN gate
  if (
    !user &&
    (request.nextUrl.pathname.startsWith("/api/gmail/public") ||
      request.nextUrl.pathname.startsWith("/api/today-schedule") ||
      request.nextUrl.pathname.startsWith("/api/report-file"))
  ) {
    const token = await getPublicPinToken();
    if (token) {
      const cookie = request.cookies.get("qms_public_pin")?.value;
      if (cookie !== token) {
        return NextResponse.json({ error: "PIN required" }, { status: 401 });
      }
    }
  }
  return supabaseResponse;
}

async function getPublicPinToken(): Promise<string | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(`${url}/rest/v1/settings?id=eq.1&select=public_pin_token`, {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const rows = await res.json();
      return rows?.[0]?.public_pin_token ?? null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}
