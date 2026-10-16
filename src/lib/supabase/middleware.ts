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

  // Public PIN gate for /public pages (except /public/auth)
  if (
    !user &&
    request.nextUrl.pathname.startsWith("/public") &&
    !request.nextUrl.pathname.startsWith("/public/auth")
  ) {
    const pinEnabled = await isPublicPinEnabled();
    if (pinEnabled) {
      const pin = request.cookies.get("qms_public_pin")?.value;
      if (!pin) {
        const url = request.nextUrl.clone();
        url.pathname = "/public/auth";
        url.searchParams.set("next", request.nextUrl.pathname);
        return NextResponse.redirect(url);
      }
    }
  }
  return supabaseResponse;
}

async function isPublicPinEnabled(): Promise<boolean> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return false;
    const res = await fetch(`${url}/rest/v1/settings?id=eq.1&select=public_pin_hash`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const rows = await res.json();
    return Boolean(rows?.[0]?.public_pin_hash);
  } catch {
    return false;
  }
}
