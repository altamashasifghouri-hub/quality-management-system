export interface GmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export function decodeMimeHeader(value: string): string {
  if (!value) return value;
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, _charset, enc, data) => {
    try {
      if (enc.toUpperCase() === "B") {
        return Buffer.from(data, "base64").toString("utf8");
      }
      const bytes = data
        .replace(/_/g, " ")
        .replace(/=([0-9A-Fa-f]{2})/g, (_x: string, h: string) => String.fromCharCode(parseInt(h, 16)));
      return Buffer.from(bytes, "binary").toString("utf8");
    } catch {
      return _m;
    }
  });
}

export function collectAttachments(payload: any): GmailAttachment[] {
  const out: GmailAttachment[] = [];
  const walk = (p: any) => {
    if (!p) return;
    if (p.filename && p.body?.attachmentId) {
      out.push({
        id: p.body.attachmentId,
        filename: p.filename,
        mimeType: p.mimeType || "application/octet-stream",
        size: p.body.size || 0,
      });
    }
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return out;
}

export function extractBodies(payload: any): { plain: string; html: string } {
  let plain = "";
  let html = "";
  const walk = (p: any) => {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data && !plain) plain = p.body.data;
    if (p.mimeType === "text/html" && p.body?.data && !html) html = p.body.data;
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  if (!plain && !html && payload?.body?.data) plain = payload.body.data;
  return { plain, html };
}

export function decodeBase64UrlUtf8(data: string): string {
  if (!data) return "";
  try {
    return Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
