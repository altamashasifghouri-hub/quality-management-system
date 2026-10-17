import { NextResponse } from "next/server";
import { supabaseFromCookies } from "@/lib/google-oauth";
import { getUploadTargets, isQuotaError, recordQuotaUsage, resolveAccounts } from "@/lib/drive-accounts";

const MAX_BYTES = 5 * 1024 * 1024 * 1024; // 5GB

export async function POST(req: Request) {
  const supabase = await supabaseFromCookies();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    if (!/^(image|video|audio|application|text)\//.test(mime) && !/\.pdf$/i.test(name)) return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
    if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: "Invalid file size." }, { status: 400 });
    if (size > MAX_BYTES) return NextResponse.json({ error: "File must be 5GB or smaller." }, { status: 400 });

    const targets = await getUploadTargets(supabase, auth.user.id, kind);
    if (!targets.length) {
      return NextResponse.json({ error: "not_connected", message: "No Google Drive account is connected." }, { status: 403 });
    }

    // The browser cannot read the resumable PUT response (Drive omits
    // Access-Control-Allow-Origin on it), so the file is tagged with a nonce
    // and located again server-side in "finish" instead.
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const since = new Date(Date.now() - 60000).toISOString();

    let lastError = "Could not start upload.";
    for (const target of targets) {
      try {
        const res = await fetch(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink,webContentLink",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${target.token}`,
              "Content-Type": "application/json; charset=UTF-8",
              "X-Upload-Content-Type": mime,
              "X-Upload-Content-Length": String(size),
            },
            body: JSON.stringify({ name, parents: [target.folderId], properties: { qms: nonce } }),
          }
        );
        if (!res.ok) {
          const text = await res.text();
          if (isQuotaError(res.status, text)) {
            lastError = "All connected Google Drive accounts are full.";
            continue;
          }
          return NextResponse.json({ error: `Could not start upload: ${res.status} ${text}` }, { status: 502 });
        }
        const uploadUrl = res.headers.get("location");
        if (!uploadUrl) return NextResponse.json({ error: "Google Drive did not return an upload session." }, { status: 502 });
        return NextResponse.json({ uploadUrl, nonce, since, size });
      } catch (e: any) {
        lastError = e?.message || lastError;
      }
    }
    return NextResponse.json({ error: lastError }, { status: 502 });
  }

  if (action === "finish") {
    const nonce = String(body.nonce || "").trim();
    const since = String(body.since || "").trim();
    const uploadName = String(body.name || "").trim().slice(0, 180);
    const size = Number(body.size || 0);
    let fileId = String(body.fileId || "").trim();

    const accounts = await resolveAccounts(supabase, auth.user.id);
    if (!accounts.length) return NextResponse.json({ error: "not_connected" }, { status: 403 });

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
        for (const account of accounts) {
          for (const q of queries) {
            try {
              const res = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink,webContentLink)&pageSize=5`,
                { headers: { Authorization: `Bearer ${account.token}` } }
              );
              if (!res.ok) continue;
              const files = ((await res.json()).files || []) as any[];
              if (files.length) { fileId = String(files[0].id); break; }
            } catch {
              /* transient — retried below */
            }
          }
          if (fileId) break;
        }
      }
      if (!fileId) return NextResponse.json({ error: "The upload did not reach Google Drive. Please try again." }, { status: 404 });
    }

    if (!fileId) return NextResponse.json({ error: "Missing fileId." }, { status: 400 });

    let lastError = "Could not finish upload.";
    for (const account of accounts) {
      try {
        const metaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,webViewLink,webContentLink`,
          { headers: { Authorization: `Bearer ${account.token}` } }
        );
        if (!metaRes.ok) continue;
        const meta = await metaRes.json();
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${account.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ role: "reader", type: "anyone" }),
        }).catch(() => {});
        if (size > 0) await recordQuotaUsage(supabase, account.id, size);
        return NextResponse.json({
          fileId,
          url: meta.webViewLink || meta.webContentLink || `https://drive.google.com/file/d/${fileId}/view`,
        });
      } catch (e: any) {
        lastError = e?.message || lastError;
      }
    }
    return NextResponse.json({ error: lastError }, { status: 500 });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
