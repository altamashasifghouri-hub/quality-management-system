import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TABLES = ["audit_reports", "audit_plans", "visit_records"];

// Cap each proxied range so a single serverless invocation streams a bounded
// slice. The browser sees the total size in Content-Range and streams/seeks by
// requesting the next slice, instead of holding one request open for the whole
// (possibly multi-hundred-MB) file until the function times out.
const RANGE_CHUNK = 8 * 1024 * 1024;

function capRange(range: string | null): string | null {
  if (!range) return null;
  const m = /^bytes=(\d+)-(\d*)$/.exec(range.trim());
  if (!m) return range;
  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : Infinity;
  if (end - start + 1 <= RANGE_CHUNK) return range;
  return `bytes=${start}-${start + RANGE_CHUNK - 1}`;
}

// Large Drive files (>~100MB) are not returned directly: Google serves a
// "Virus scan warning" HTML page instead. `confirm=t` skips that, and the page
// still exposes a short-lived `uuid` for files that require the extra token.
async function openDriveFile(id: string, range: string | null) {
  const base = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`;
  const headers: Record<string, string> = {};
  if (range) headers.Range = range;
  const doFetch = (url: string) =>
    fetch(url, { headers, redirect: "follow", cache: "no-store" });
  let upstream = await doFetch(base);
  const ct = upstream.headers.get("content-type") || "";
  if (ct.includes("text/html")) {
    let html = "";
    try {
      html = await upstream.text();
    } catch {
      /* fall through and let the caller handle the failed response */
    }
    const uuid = html.match(/name="uuid"\s+value="([^"]+)"/)?.[1];
    if (uuid) upstream = await doFetch(`${base}&uuid=${encodeURIComponent(uuid)}`);
  }
  return upstream;
}

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
      const range = capRange(req.headers.get("range"));
      const upstream = await openDriveFile(id, range);
      if (!upstream.ok || !upstream.body) {
        return new NextResponse("Could not load media", { status: 502 });
      }
      const ct =
        upstream.headers.get("content-type") ||
        (kind === "video" ? "video/mp4" : "audio/mpeg");
      if (ct.includes("text/html")) {
        return new NextResponse("Could not load media", { status: 502 });
      }
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
    const upstream = await openDriveFile(id, capRange(req.headers.get("range")));
    if (!upstream.ok || !upstream.body) {
      return new NextResponse("Could not load report file", { status: 502 });
    }
    const resHeaders = new Headers({
      "Content-Type": "application/pdf",
      "Content-Disposition": dl ? 'attachment; filename="report.pdf"' : 'inline; filename="report.pdf"',
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
    return new NextResponse("Could not load report file", { status: 502 });
  }
}