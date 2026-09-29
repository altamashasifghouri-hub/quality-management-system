import { NextResponse } from "next/server";
import JSZip from "jszip";
import { supabaseFromCookies } from "@/lib/google-oauth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_CHARS = 150000;
const ALLOWED = [".txt", ".md", ".csv", ".docx", ".pdf"];

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#\d+;/g, (m) => {
      const code = parseInt(m.slice(2, -1), 10);
      try { return String.fromCodePoint(code); } catch { return " "; }
    });
}

function stripDocxXml(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab[^>]*\/>/g, " ")
      .replace(/<w:br[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export async function POST(req: Request) {
  const supabase = await supabaseFromCookies();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File must be 4MB or smaller." }, { status: 413 });
  if (file.size === 0) return NextResponse.json({ error: "File is empty." }, { status: 400 });

  const name = file.name.toLowerCase();
  const ext = (name.match(/\.[a-z0-9]+$/i) || [])[0]?.toLowerCase() || "";
  if (!ALLOWED.includes(ext)) {
    return NextResponse.json({ error: "Supported formats: TXT, DOCX, PDF." }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";

  try {
    if (ext === ".pdf") {
      const mod: any = await import("pdf-parse");
      const PDFParseCtor = mod.PDFParse || mod.default?.PDFParse || mod.default;
      if (!PDFParseCtor) return NextResponse.json({ error: "PDF engine unavailable." }, { status: 500 });
      const parser = new PDFParseCtor({ data: buffer });
      try {
        const result = await parser.getText();
        text = String(result?.text || "");
      } finally {
        try { parser.destroy(); } catch { /* ignore */ }
      }
    } else if (ext === ".docx") {
      const zip = await JSZip.loadAsync(buffer);
      const entry = zip.file("word/document.xml");
      if (!entry) return NextResponse.json({ error: "This DOCX has no readable content." }, { status: 400 });
      const xml = await entry.async("string");
      text = stripDocxXml(xml);
    } else {
      text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    }
  } catch {
    return NextResponse.json({ error: "Could not read this file. Try saving it again as PDF or copy the policy text into a TXT file." }, { status: 422 });
  }

  text = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return NextResponse.json({ error: "No text could be extracted (the PDF may be a scanned image). Try a text/Word version." }, { status: 422 });

  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS) + "\n[… remainder truncated …]";

  return NextResponse.json({
    text,
    fileName: file.name,
    charCount: text.length,
    truncated,
  });
}