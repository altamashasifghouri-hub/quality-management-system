import { NextResponse } from "next/server";
import { supabaseFromCookies } from "@/lib/google-oauth";
import { getUploadTargets, isQuotaError, recordQuotaUsage } from "@/lib/drive-accounts";

export async function POST(req: Request) {
  const supabase = await supabaseFromCookies();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const name = file.name || `evidence-${Date.now()}.jpg`;
    const mime = file.type || "image/jpeg";

    const targets = await getUploadTargets(supabase, auth.user.id, "evidence");
    if (!targets.length) {
      return NextResponse.json({ error: "not_connected", message: "No Google Drive account is connected." }, { status: 403 });
    }

    let lastError = "Upload failed";
    for (const target of targets) {
      const boundary = `qms-ev-${Date.now().toString(36)}`;
      const meta = JSON.stringify({ name, parents: [target.folderId] });
      const head = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
        "utf8"
      );
      const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");

      const res = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${target.token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: Buffer.concat([head, bytes, tail]),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        if (isQuotaError(res.status, text)) {
          lastError = "All connected Google Drive accounts are full.";
          continue;
        }
        throw new Error(`Drive upload failed: ${res.status} ${text}`);
      }

      const json = await res.json();
      const fileId = json.id as string;

      await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${target.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      }).catch(() => {});

      await recordQuotaUsage(supabase, target.accountId, bytes.length);

      return NextResponse.json({
        url: json.id ? `https://drive.google.com/thumbnail?id=${json.id}&sz=w400` : (json.webContentLink || json.webViewLink || ""),
        fileId,
      });
    }

    return NextResponse.json({ error: lastError }, { status: 403 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}
