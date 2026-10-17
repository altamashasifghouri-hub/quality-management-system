import { NextRequest, NextResponse } from "next/server";
import { supabaseFromCookies } from "@/lib/google-oauth";
import { resolveAccounts } from "@/lib/drive-accounts";
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
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accounts = await resolveAccounts(supabase, auth.user.id);
  if (!accounts.length) return NextResponse.json({ error: "not_connected" }, { status: 403 });

  let lastError = "Download failed";
  for (const account of accounts) {
    try {
      let filename = "download";
      let mime = "application/octet-stream";
      try {
        const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`, {
          headers: { Authorization: `Bearer ${account.token}` },
        });
        if (meta.ok) {
          const json = await meta.json();
          if (json.name) filename = json.name;
          if (json.mimeType) mime = json.mimeType;
        }
      } catch {
        /* metadata unavailable, fall back to generic name */
      }

      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${account.token}` },
      });
      if (!res.ok) {
        lastError = `Drive download failed: ${res.status}`;
        continue;
      }

      if (!/\.[A-Za-z0-9]{2,5}$/.test(filename)) filename += ".pdf";
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
      lastError = e?.message || lastError;
    }
  }

  return NextResponse.json({ error: lastError }, { status: 500 });
}
