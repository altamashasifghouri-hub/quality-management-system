import { NextResponse } from "next/server";
import { getGoogleAccessToken, supabaseFromCookies } from "@/lib/google-oauth";
import { driveFolderId } from "@/lib/drive";

export async function POST(req: Request) {
  const supabase = await supabaseFromCookies();
  const tokenResult = await getGoogleAccessToken(supabase);
  if (!tokenResult.connected) {
    const status = tokenResult.error === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ error: tokenResult.error === "not_connected" ? "not_connected" : "Unauthorized" }, { status });
  }
  const token = tokenResult.token;

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const name = file.name || "audit_plan.pdf";
    const kind = typeof form.get("folderKind") === "string" ? (form.get("folderKind") as string) : "plan";

    const folderId = driveFolderId(kind);
    if (!folderId) return NextResponse.json({ error: "Google Drive folder is not configured." }, { status: 500 });

    const boundary = `qms-${Date.now().toString(36)}`;
    const meta = JSON.stringify({ name, parents: [folderId] });
    const head = Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
      "utf8"
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");

    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: Buffer.concat([head, bytes, tail]),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Drive upload failed: ${res.status} ${text}`);
    }
    const json = await res.json();
    const fileId = json.id as string;

    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    }).catch(() => {});

    return NextResponse.json({
      url: json.webViewLink || json.webContentLink || "",
      fileId,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}