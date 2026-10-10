import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TABLES = ["audit_reports", "audit_plans", "visit_records"];

async function isKnownPublicFile(fileId: string): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return true;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  for (const table of TABLES) {
    try {
      const res = await fetch(
        `${base}/rest/v1/${table}?select=id&pdf_public_id=eq.${encodeURIComponent(fileId)}&limit=1`,
        { headers, cache: "no-store" }
      );
      if (!res.ok) continue;
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) return true;
    } catch {
      /* try next table */
    }
  }
  return false;
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const kind = req.nextUrl.searchParams.get("kind");
  const dl = req.nextUrl.searchParams.get("download") === "1";
  if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) {
    return new NextResponse("Missing or invalid file id", { status: 400 });
  }

  if (kind === "image") {
    try {
      const upstream = await fetch(`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w2000`, {
        redirect: "follow",
        cache: "force-cache",
      });
      if (!upstream.ok || !upstream.body) {
        return new NextResponse("Could not load image", { status: 502 });
      }
      const ct = upstream.headers.get("content-type") || "image/jpeg";
      return new NextResponse(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": ct,
          "Content-Disposition": dl ? 'attachment; filename="evidence.jpg"' : "inline",
          "Cache-Control": "public, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new NextResponse("Could not load image", { status: 502 });
    }
  }

  if (kind === "video" || kind === "audio") {
    try {
      const range = req.headers.get("range");
      const fh: HeadersInit = {};
      if (range) fh.Range = range;
      const upstream = await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`, {
        headers: fh,
        redirect: "follow",
        cache: "no-store",
      });
      if (!upstream.ok || !upstream.body) {
        return new NextResponse("Could not load media", { status: 502 });
      }
      const ct =
        upstream.headers.get("content-type") ||
        (kind === "video" ? "video/mp4" : "audio/mpeg");
      const resHeaders = new Headers({
        "Content-Type": ct,
        "Content-Disposition": dl ? 'attachment; filename="media"' : "inline",
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      });
      const cr = upstream.headers.get("content-range");
      const cl = upstream.headers.get("content-length");
      if (cr) resHeaders.set("Content-Range", cr);
      if (cl) resHeaders.set("Content-Length", cl);
      return new NextResponse(upstream.body, {
        status: upstream.status === 206 ? 206 : 200,
        headers: resHeaders,
      });
    } catch {
      return new NextResponse("Could not load media", { status: 502 });
    }
  }

  if (!(await isKnownPublicFile(id))) {
    return new NextResponse("Report not found", { status: 404 });
  }

  try {
    const upstream = await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`, {
      redirect: "follow",
      cache: "no-store",
    });
    if (!upstream.ok || !upstream.body) {
      return new NextResponse("Could not load report file", { status: 502 });
    }
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": dl ? 'attachment; filename="report.pdf"' : 'inline; filename="report.pdf"',
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Could not load report file", { status: 502 });
  }
}