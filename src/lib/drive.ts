export function driveFolderId(kind: string = "plan") {
  if (kind === "report") return process.env.GOOGLE_DRIVE_REPORT_FOLDER_ID || "";
  return process.env.GOOGLE_DRIVE_PLAN_FOLDER_ID || "";
}

export async function driveListing(token: string, kind: string) {
  const folderId = driveFolderId(kind);
  if (!folderId) throw new Error("Google Drive folder is not configured.");
  const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,size,mimeType,createdTime,webViewLink,webContentLink)&orderBy=createdTime%20desc&pageSize=1000`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Drive files failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return (json.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    bytes: Number(f.size || 0),
    mimeType: f.mimeType,
    created_at: f.createdTime,
    url: f.webViewLink || f.webContentLink || "",
  }));
}