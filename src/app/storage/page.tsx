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

interface CloudinaryResource {
  public_id: string;
  format: string;
  bytes: number;
  secure_url: string;
  created_at: string;
  resource_type: string;
}

interface CloudinaryUsage {
  storage?: {
    usage?: { bytes?: number; resources?: number };
    limit?: number;
    used_percent?: number;
  };
}

function fmtBytes(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(s: string) {
  return s ? new Date(s).toLocaleDateString() : "—";
}

export default function StoragePage() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [usage, setUsage] = useState<CloudinaryUsage | null>(null);
  const [resources, setResources] = useState<CloudinaryResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 4000); }
  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 4000); }

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, cRes] = await Promise.all([
        fetch("/api/storage?source=supabase"),
        fetch("/api/storage?source=cloudinary"),
      ]);
      if (tRes.ok) setTables((await tRes.json()).tables || []);
      else showErr("Could not load Supabase tables.");
      if (cRes.ok) {
        const json = await cRes.json();
        setUsage(json.usage);
        setResources(json.resources || []);
      } else showErr("Could not load Cloudinary storage.");
    } catch {
      showErr("Storage load failed.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const dbBytes = tables.length ? tables[0].db_bytes : 0;
  const cStorage = usage?.storage;
  const cBytes = cStorage?.usage?.bytes || 0;
  const cLimit = cStorage?.limit || 0;
  const cPct = cStorage?.used_percent ?? (cLimit ? (cBytes / cLimit) * 100 : 0);

  async function deleteResource(r: CloudinaryResource) {
    if (!confirm(`Delete "${r.public_id}"?`)) return;
    setBusy(true);
    const res = await fetch(
      `/api/storage?source=cloudinary&resourceType=${r.resource_type}&publicId=${encodeURIComponent(r.public_id)}`,
      { method: "DELETE" }
    );
    setBusy(false);
    if (!res.ok) return showErr((await res.json()).error || "Delete failed.");
    showMsg("Deleted.");
    fetchAll();
  }

  async function deleteAll() {
    if (resources.length === 0) return;
    if (!confirm(`Delete all ${resources.length} file(s)?`)) return;
    setBusy(true);
    let ok = true;
    for (const r of resources) {
      const res = await fetch(
        `/api/storage?source=cloudinary&resourceType=${r.resource_type}&publicId=${encodeURIComponent(r.public_id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) { ok = false; break; }
    }
    setBusy(false);
    showMsg(ok ? "All files deleted." : "Some files could not be deleted.");
    fetchAll();
  }

  async function downloadAll() {
    if (resources.length === 0) return;
    setBusy(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < resources.length; i++) {
        const r = resources[i];
        const blob: Blob = await (await fetch(r.secure_url)).blob();
        const ext = r.format || "file";
        const dir = r.public_id.includes("/") ? r.public_id.split("/")[0] : "files";
        const name = r.public_id.split("/").pop() || `file-${i + 1}`;
        zip.file(`${dir}/${name}.${ext}`, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cloudinary-files.zip";
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
        <p className="text-blue-200/60 mb-8">Supabase tables and Cloudinary file storage usage</p>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

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
                  <h2 className="text-lg font-semibold text-white">Cloudinary</h2>
                  <p className="text-xs text-blue-200/60 mt-1">{resources.length} file(s) listed</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={fetchAll} disabled={busy} className={`${btnCls} bg-white/10 hover:bg-white/20`}>Refresh</button>
                  <button onClick={downloadAll} disabled={busy || resources.length === 0} className={`${btnCls} bg-green-600 hover:bg-green-500`}>{busy ? "..." : "Download ZIP"}</button>
                  <button onClick={deleteAll} disabled={busy || resources.length === 0} className={`${btnCls} bg-red-600 hover:bg-red-500`}>Delete All</button>
                </div>
              </div>

              <div className="px-6 py-4 border-b border-white/10">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-white/80">Storage used</span>
                  <span className="text-blue-200/60 text-xs">{fmtBytes(cBytes)} of {fmtBytes(cLimit)} · {cPct.toFixed(2)}%</span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${cPct > 80 ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${Math.min(Math.max(cPct, 0.5), 100)}%` }} />
                </div>
              </div>

              <div className="max-h-[420px] overflow-y-auto">
                {resources.length === 0 ? (
                  <p className="text-blue-200/40 text-center py-10 text-sm">No files stored in Cloudinary yet.</p>
                ) : (
                  <div className="divide-y divide-white/5">
                    {resources.map((r) => (
                      <div key={r.public_id} className="px-6 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-white/80 truncate">{r.public_id}</p>
                          <p className="text-xs text-blue-200/40">
                            {r.format?.toUpperCase()} · {fmtBytes(r.bytes)} · {fmtDate(r.created_at)} · {r.resource_type}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={r.secure_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:text-blue-300">Open</a>
                          <button onClick={() => deleteResource(r)} disabled={busy} className="text-xs text-red-400 hover:text-red-300">Delete</button>
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