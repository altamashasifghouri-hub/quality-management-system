import { NextRequest, NextResponse } from "next/server";
import { getGoogleAccessToken, supabaseFromCookies } from "@/lib/google-oauth";
import { driveFileIdFromUrl } from "@/lib/drive-file";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("fileId") || req.nextUrl.searchParams.get("url");
  if (!raw) return new NextResponse("Missing fileId", { status: 400 });

  const fileId = driveFileIdFromUrl(raw);
  if (!fileId || !/^[A-Za-z0-9_-]{10,}$/.test(fileId)) {
    return new NextResponse("Invalid fileId", { status: 400 });
  }

  const supabase = await supabaseFromCookies();
  const tokenResult = await getGoogleAccessToken(supabase);
  if (!tokenResult.connected) {
    const err = tokenResult.error === "not_connected" ? "not_connected" : "Unauthorized";
    return NextResponse.json({ error: err }, { status: tokenResult.error === "Unauthorized" ? 401 : 403 });
  }
  const token = tokenResult.token;

  try {
    let filename = "download";
    let mime = "application/octet-stream";
    try {
      const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meta.ok) {
        const json = await meta.json();
        if (json.name) filename = json.name;
        if (json.mimeType) mime = json.mimeType;
      }
    } catch {
      /* metadata unavailable, fall back to generic name */
    }
    if (!/\.[A-Za-z0-9]{2,5}$/.test(filename)) filename += ".pdf";

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Drive download failed: ${res.status} ${await res.text()}`);
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    const safe = filename.replace(/[^\w.\-]+/g, "_");
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="${safe}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Download failed" }, { status: 500 });
  }
}
