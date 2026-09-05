"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import JSZip from "jszip";

interface TableInfo {
  table_name: string;
  total_bytes: number;
  approximate_rows: number;
  db_bytes: number;
}

interface DriveFile {
  id: string;
  name: string;
  bytes: number;
  mimeType: string;
  created_at: string;
  url: string;
}

function fmtBytes(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtDate(s: string) {
  return s ? new Date(s).toLocaleDateString() : "—";
}

export default function StoragePage() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [driveInfo, setDriveInfo] = useState<{ storageBytes: number; storageLimit: number; quotaUsage: number } | null>(null);
  const [driveConfigured, setDriveConfigured] = useState<boolean | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 4000); }
  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 4000); }

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, dRes] = await Promise.all([
        fetch("/api/storage?source=supabase"),
        fetch("/api/storage?source=drive"),
      ]);
      if (tRes.ok) setTables((await tRes.json()).tables || []);
      else showErr("Could not load Supabase tables.");
      if (dRes.ok) {
        const json = await dRes.json();
        if (json.connected === false) {
          setConnected(false);
          setDriveConfigured(true);
        } else {
          setConnected(true);
          setDriveConfigured(true);
          setDriveInfo({
            storageBytes: json.storageBytes || 0,
            storageLimit: json.storageLimit || 0,
            quotaUsage: json.quotaUsage || 0,
          });
          setFiles(json.files || []);
        }
      } else {
        const body = await dRes.json().catch(() => ({}));
        if (body?.error?.includes("not configured") || body?.error?.includes("Drive")) {
          setDriveConfigured(false);
        } else {
          setDriveConfigured(false);
          showErr(body?.error || "Could not load Google Drive storage.");
        }
      }
    } catch {
      showErr("Storage load failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const dbBytes = tables.length ? tables[0].db_bytes : 0;
  const dBytes = driveInfo?.storageBytes || 0;
  const dLimit = driveInfo?.storageLimit || 0;
  const dQuota = driveInfo?.quotaUsage || 0;
  const dPct = dLimit ? (dQuota / dLimit) * 100 : 0;

  async function disconnect() {
    if (!confirm("Disconnect Google Drive? Saved files stay in Drive.")) return;
    setBusy(true);
    const res = await fetch("/api/google-drive/disconnect", { method: "POST" });
    setBusy(false);
    if (!res.ok) return showErr("Could not disconnect.");
    setConnected(null);
    setFiles([]);
    showMsg("Disconnected.");
  }

  async function deleteResource(f: DriveFile) {
    if (!confirm(`Delete "${f.name}"?`)) return;
    setBusy(true);
    const res = await fetch(`/api/storage?source=drive&fileId=${encodeURIComponent(f.id)}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return showErr((await res.json()).error || "Delete failed.");
    showMsg("Deleted.");
    fetchAll();
  }

  async function deleteAll() {
    if (files.length === 0) return;
    if (!confirm(`Delete all ${files.length} file(s)?`)) return;
    setBusy(true);
    let ok = true;
    for (const f of files) {
      const res = await fetch(`/api/storage?source=drive&fileId=${encodeURIComponent(f.id)}`, { method: "DELETE" });
      if (!res.ok) { ok = false; break; }
    }
    setBusy(false);
    showMsg(ok ? "All files deleted." : "Some files could not be deleted.");
    fetchAll();
  }

  async function downloadAll() {
    if (files.length === 0) return;
    setBusy(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const blob: Blob = await (await fetch(`https://drive.google.com/uc?export=download&id=${f.id}`)).blob();
        zip.file(f.name, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "google-drive-files.zip";
      a.click();
      URL.revokeObjectURL(url);
      showMsg("Zip downloaded.");
    } catch {
      showErr("Could not create zip.");
    } finally {
      setBusy(false);
    }
  }

  const btnCls = "px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="mb-4">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to Dashboard
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">Storage</h1>
        <p className="text-blue-200/60 mb-8">Supabase tables and Google Drive file storage usage</p>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}
        {connected === false && driveConfigured && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-sm rounded-lg px-4 py-3 mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-yellow-200">Google Drive is not connected</p>
              <p className="text-yellow-300/60 mt-1">Connect your Google account to store audit plan PDFs in your Drive folders.</p>
            </div>
            <a href="/api/google-drive/auth" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium shrink-0">
              Connect Google Drive
            </a>
          </div>
        )}
        {driveConfigured === false && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-sm rounded-lg px-4 py-3 mb-6">
            Google Drive is not configured yet.
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">Supabase Database</h2>
                <p className="text-xs text-blue-200/60 mt-1">Tables and estimated sizes (approx. rows)</p>
              </div>
              <div className="p-6">
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <div className="text-3xl font-bold text-white">{fmtBytes(dbBytes)}</div>
                    <div className="text-xs text-blue-200/60 mt-1">Total database size</div>
                  </div>
                  <button onClick={fetchAll} className="text-xs text-blue-400 hover:text-blue-300">Refresh</button>
                </div>
                <div className="space-y-3">
                  {tables.length === 0 && <p className="text-blue-200/40 text-center py-6 text-sm">No tables found.</p>}
                  {tables.map((t) => {
                    const pct = dbBytes ? Math.max((t.total_bytes / dbBytes) * 100, 0.1) : 0;
                    return (
                      <div key={t.table_name}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-white/80">{t.table_name}</span>
                          <span className="text-blue-200/50 text-xs">
                            {fmtBytes(t.total_bytes)} · {t.approximate_rows.toLocaleString()} rows · {pct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Google Drive</h2>
                  <p className="text-xs text-blue-200/60 mt-1">{connected ? `${files.length} file(s) listed` : "Connect to view files"}</p>
                </div>
                <div className="flex gap-2">
                  {connected && (
                    <button onClick={disconnect} disabled={busy} className={`${btnCls} bg-white/10 hover:bg-white/20`}>Disconnect</button>
                  )}
                  <button onClick={fetchAll} disabled={busy} className={`${btnCls} bg-white/10 hover:bg-white/20`}>Refresh</button>
                  <button onClick={downloadAll} disabled={busy || files.length === 0} className={`${btnCls} bg-green-600 hover:bg-green-500`}>{busy ? "..." : "Download ZIP"}</button>
                  <button onClick={deleteAll} disabled={busy || files.length === 0} className={`${btnCls} bg-red-600 hover:bg-red-500`}>Delete All</button>
                </div>
              </div>

              <div className="px-6 py-4 border-b border-white/10">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-white/80">Storage used</span>
                  <span className="text-blue-200/60 text-xs">{fmtBytes(dBytes)} in folder · {fmtBytes(dQuota)} of {fmtBytes(dLimit)} Drive quota · {dPct.toFixed(2)}%</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${dPct > 80 ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${Math.min(Math.max(dPct, 0.5), 100)}%` }} />
                </div>
              </div>

              <div className="max-h-[420px] overflow-y-auto">
                {files.length === 0 ? (
                  <p className="text-blue-200/40 text-center py-10 text-sm">No files stored in the Drive folder yet.</p>
                ) : (
                  <div className="divide-y divide-white/5">
                    {files.map((f) => (
                      <div key={f.id} className="px-6 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-white/80 truncate">{f.name}</p>
                          <p className="text-xs text-blue-200/40">
                            PDF · {fmtBytes(f.bytes)} · {fmtDate(f.created_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">Open</a>
                          <button onClick={() => deleteResource(f)} disabled={busy} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}