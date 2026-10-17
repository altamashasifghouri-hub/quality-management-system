import { refreshAccessToken } from "@/lib/google-oauth";

export interface DriveAccount {
  id: string;
  user_id: string;
  email: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string | null;
  plan_folder_id: string | null;
  report_folder_id: string | null;
  evidence_folder_id: string | null;
  capa_folder_id: string | null;
  sort_order: number;
  client_key: string;
  is_preferred: boolean;
  quota_usage: number;
  quota_limit: number;
  quota_checked_at: string | null;
}

export interface UploadTarget {
  accountId: string;
  email: string | null;
  token: string;
  folderId: string;
}

type FolderColumn = "plan_folder_id" | "report_folder_id" | "evidence_folder_id" | "capa_folder_id";

const FOLDER_COLUMN: Record<string, FolderColumn> = {
  plan: "plan_folder_id",
  report: "report_folder_id",
  evidence: "evidence_folder_id",
  capa: "capa_folder_id",
};

export function accountFolderId(account: Pick<DriveAccount, "plan_folder_id" | "report_folder_id" | "evidence_folder_id" | "capa_folder_id">, kind: string): string {
  const col = FOLDER_COLUMN[kind] || "plan_folder_id";
  return (account[col] as string) || "";
}

export async function listDriveAccounts(supabase: any, userId: string): Promise<DriveAccount[]> {
  const { data } = await supabase
    .from("drive_accounts")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  return (data || []) as DriveAccount[];
}

async function freshToken(supabase: any, account: DriveAccount): Promise<string | null> {
  const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60000) return account.access_token;
  const refreshed = await refreshAccessToken(account.refresh_token, account.client_key || "default");
  if (!refreshed?.access_token) return null;
  const newExpiry = new Date(Date.now() + Number(refreshed.expires_in || 3600) * 1000).toISOString();
  await supabase
    .from("drive_accounts")
    .update({ access_token: refreshed.access_token, expires_at: newExpiry, updated_at: new Date().toISOString() })
    .eq("id", account.id);
  account.access_token = refreshed.access_token;
  account.expires_at = newExpiry;
  return refreshed.access_token as string;
}

export interface ResolvedAccount extends DriveAccount {
  token: string;
}

export async function resolveAccounts(supabase: any, userId: string): Promise<ResolvedAccount[]> {
  const accounts = await listDriveAccounts(supabase, userId);
  const out: ResolvedAccount[] = [];
  for (const account of accounts) {
    const token = await freshToken(supabase, account);
    if (token) out.push({ ...account, token });
  }
  return out;
}

function hasRoom(account: DriveAccount): boolean {
  if (!account.quota_limit || account.quota_limit <= 0) return true;
  return account.quota_usage < account.quota_limit * 0.98;
}

export async function getUploadTargets(supabase: any, userId: string, kind: string): Promise<UploadTarget[]> {
  const accounts = await resolveAccounts(supabase, userId);
  const withRoom = accounts.filter(hasRoom);
  const ordered = (withRoom.length ? withRoom : accounts).sort((a, b) => {
    if (a.is_preferred !== b.is_preferred) return a.is_preferred ? -1 : 1;
    return a.sort_order - b.sort_order;
  });
  return ordered
    .map((a) => ({ accountId: a.id, email: a.email, token: a.token, folderId: accountFolderId(a, kind) }))
    .filter((t) => t.folderId);
}

export async function setPreferredAccount(supabase: any, userId: string, id: string): Promise<boolean> {
  const { error: clearErr } = await supabase
    .from("drive_accounts")
    .update({ is_preferred: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (clearErr) return false;
  const { error } = await supabase
    .from("drive_accounts")
    .update({ is_preferred: true, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  return !error;
}

export async function provisionAccountFolders(supabase: any, account: ResolvedAccount): Promise<boolean> {
  if (account.plan_folder_id && account.report_folder_id && account.evidence_folder_id && account.capa_folder_id) {
    return true;
  }
  try {
    const folders = await provisionFolders(account.token);
    const { error } = await supabase
      .from("drive_accounts")
      .update({
        plan_folder_id: folders.plan,
        report_folder_id: folders.report,
        evidence_folder_id: folders.evidence,
        capa_folder_id: folders.capa,
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);
    return !error;
  } catch {
    return false;
  }
}

export function isQuotaError(status: number, body: string): boolean {
  return status === 403 && /storageQuotaExceeded|quota/i.test(body);
}

export async function recordQuotaUsage(supabase: any, accountId: string, addedBytes: number): Promise<void> {
  try {
    const { data } = await supabase.from("drive_accounts").select("quota_usage").eq("id", accountId).maybeSingle();
    const current = Number(data?.quota_usage || 0);
    await supabase
      .from("drive_accounts")
      .update({ quota_usage: current + Number(addedBytes || 0), quota_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", accountId);
  } catch {
    /* best effort */
  }
}

export async function fetchDriveQuota(token: string): Promise<{ usage: number; limit: number } | null> {
  try {
    const res = await fetch("https://www.googleapis.com/drive/v3/about?fields=storageQuota(limit,usage)", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return { usage: Number(json?.storageQuota?.usage || 0), limit: Number(json?.storageQuota?.limit || 0) };
  } catch {
    return null;
  }
}

export async function refreshStoredQuota(supabase: any, account: ResolvedAccount): Promise<{ usage: number; limit: number }> {
  const quota = await fetchDriveQuota(account.token);
  if (!quota) return { usage: account.quota_usage, limit: account.quota_limit };
  await supabase
    .from("drive_accounts")
    .update({ quota_usage: quota.usage, quota_limit: quota.limit, quota_checked_at: new Date().toISOString() })
    .eq("id", account.id);
  return quota;
}

export async function provisionFolders(token: string): Promise<{ plan: string; report: string; evidence: string; capa: string }> {
  async function createFolder(name: string, parent?: string) {
    const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parent ? { parents: [parent] } : {}) }),
    });
    if (!res.ok) throw new Error(`Could not create Drive folder: ${res.status} ${await res.text()}`);
    return (await res.json()).id as string;
  }
  const root = await createFolder("QMS");
  const [plan, report, evidence, capa] = await Promise.all([
    createFolder("Audit Plans", root),
    createFolder("Audit Reports", root),
    createFolder("Evidence", root),
    createFolder("CAPA", root),
  ]);
  return { plan, report, evidence, capa };
}
