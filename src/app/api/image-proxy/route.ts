import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return new NextResponse("Missing url", { status: 400 });
  let target = raw;
  try { target = decodeURIComponent(raw); } catch { /* keep raw */ }
  if (!/^https?:\/\//.test(target)) return new NextResponse("Invalid url", { status: 400 });
  try {
    const res = await fetch(target, { cache: "no-store" });
    if (!res.ok) return new NextResponse("Upstream error", { status: 502 });
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/jpeg";
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new NextResponse("Fetch failed", { status: 502 });
  }
}