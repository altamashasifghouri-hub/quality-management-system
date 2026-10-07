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

    // The browser cannot read the resumable PUT response (Drive omits
    // Access-Control-Allow-Origin on it), so the file is tagged with a nonce
    // and located again server-side in "finish" instead.
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const since = new Date(Date.now() - 60000).toISOString();

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
          body: JSON.stringify({ name, parents: [folderId], properties: { qms: nonce } }),
        }
      );
      if (!res.ok) return NextResponse.json({ error: `Could not start upload: ${res.status} ${await res.text()}` }, { status: 502 });
      const uploadUrl = res.headers.get("location");
      if (!uploadUrl) return NextResponse.json({ error: "Google Drive did not return an upload session." }, { status: 502 });
      return NextResponse.json({ uploadUrl, nonce, since });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Could not start upload." }, { status: 500 });
    }
  }

  if (action === "finish") {
    const nonce = String(body.nonce || "").trim();
    const since = String(body.since || "").trim();
    const uploadName = String(body.name || "").trim().slice(0, 180);
    let fileId = String(body.fileId || "").trim();

    if (!fileId && nonce) {
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(nonce)) return NextResponse.json({ error: "Invalid upload token." }, { status: 400 });
      const sinceQ = /^\d{4}-\d{2}-\d{2}T/.test(since) ? since.replace(/\.\d+Z$/, "") : new Date(Date.now() - 30 * 60 * 1000).toISOString().replace(/\.\d+Z$/, "");
      const escapedName = uploadName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const queries = [
        `properties has { key='qms' and value='${nonce}' } and trashed = false`,
        ...(escapedName ? [`name = '${escapedName}' and createdTime >= '${sinceQ}' and trashed = false`] : []),
      ];
      for (let attempt = 0; attempt < 6 && !fileId; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 400));
        for (const q of queries) {
          try {
            const res = await fetch(
              `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink,webContentLink)&pageSize=5`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) continue;
            const files = ((await res.json()).files || []) as any[];
            if (files.length) { fileId = String(files[0].id); break; }
          } catch {
            /* transient — retried below */
          }
        }
      }
      if (!fileId) return NextResponse.json({ error: "The upload did not reach Google Drive. Please try again." }, { status: 404 });
    }

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
