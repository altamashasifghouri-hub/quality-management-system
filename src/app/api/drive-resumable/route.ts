import { NextResponse } from "next/server";
import { getGoogleAccessToken, supabaseFromCookies } from "@/lib/google-oauth";
import { driveFolderId } from "@/lib/drive";

const MAX_BYTES = 500 * 1024 * 1024;

export async function POST(req: Request) {
  const supabase = await supabaseFromCookies();
  const tokenResult = await getGoogleAccessToken(supabase);
  if (!tokenResult.connected) {
    const status = tokenResult.error === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: tokenResult.error === "not_connected" ? "not_connected" : "Unauthorized" }, { status });
  }
  const token = tokenResult.token;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const action = String(body.action || "");

  if (action === "init") {
    const name = String(body.name || "").trim().slice(0, 180);
    const mime = String(body.mime || "video/mp4").slice(0, 100);
    const size = Number(body.size || 0);
    const kind = String(body.folderKind || "evidence");
    if (!name) return NextResponse.json({ error: "Missing file name." }, { status: 400 });
    if (!/^(image|video|audio)\//.test(mime)) return NextResponse.json({ error: "Only images, videos and audio can be uploaded." }, { status: 400 });
    if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "Invalid file size." }, { status: 400 });
    if (size > MAX_BYTES) return NextResponse.json({ error: "File must be 500MB or smaller." }, { status: 400 });
    const folderId = driveFolderId(kind);
    if (!folderId) return NextResponse.json({ error: "Google Drive folder is not configured." }, { status: 500 });

    try {
      const res = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink,webContentLink",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": mime,
            "X-Upload-Content-Length": String(size),
          },
          body: JSON.stringify({ name, parents: [folderId] }),
        }
      );
      if (!res.ok) return NextResponse.json({ error: `Could not start upload: ${res.status} ${await res.text()}` }, { status: 502 });
      const uploadUrl = res.headers.get("location");
      if (!uploadUrl) return NextResponse.json({ error: "Google Drive did not return an upload session." }, { status: 502 });
      return NextResponse.json({ uploadUrl });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Could not start upload." }, { status: 500 });
    }
  }

  if (action === "finish") {
    const fileId = String(body.fileId || "").trim();
    if (!fileId) return NextResponse.json({ error: "Missing fileId." }, { status: 400 });
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      }).catch(() => {});
      const meta = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,webViewLink,webContentLink`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then((r) => r.json());
      return NextResponse.json({
        fileId,
        url: meta.webViewLink || meta.webContentLink || `https://drive.google.com/file/d/${fileId}/view`,
      });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Could not finish upload." }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
