export function buildGmailQuery(raw: string): string {
  const q = (raw || "").trim();
  if (!q) return "";

  const hasOperator = /(^|[\s(])(from|to|cc|bcc|subject|label|has|in|is|newer|older|after|before|category|list|filename|rfc822msgid):/i.test(q);
  if (hasOperator) return q;

  const parts = q.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const emails = parts.filter((p) => p.includes("@"));

  if (emails.length === 0) return q;

  const clauses: string[] = [];
  for (const e of emails) {
    clauses.push(`from:${e}`, `to:${e}`);
  }
  return `(${clauses.join(" OR ")})`;
}
