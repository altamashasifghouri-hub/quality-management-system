"use client";

import { useState } from "react";

export interface GmailMsgMeta {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  unread?: boolean;
}

interface GmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  attachments?: { id: string; filename: string; mimeType: string; size: number }[];
}

interface Props {
  messages: GmailMsgMeta[];
  next: string | null;
  loading: boolean;
  error: string | null;
  onLoadMore: () => void;
  onRefresh: () => void;
  endpointBase: string;
  emptyText?: string;
  connected: boolean;
}

export default function GmailMessages({
  messages,
  next,
  loading,
  error,
  onLoadMore,
  onRefresh,
  endpointBase,
  emptyText = "No messages found for the current filter.",
  connected,
}: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<GmailMessage | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; name: string; download: string } | null>(null);
  const [scale, setScale] = useState(1);

  async function toggle(id: string) {
    if (selected === id) {
      setSelected(null);
      setDetail(null);
      return;
    }
    setSelected(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`${endpointBase}/message?id=${encodeURIComponent(id)}`);
      const j = await res.json();
      if (j.ok) setDetail(j);
    } finally {
      setDetailLoading(false);
    }
  }

  function attachmentHref(a: { id: string; filename: string; mimeType: string }, download = false) {
    const base = `${endpointBase}/attachment?messageId=${encodeURIComponent(detail!.id)}&id=${encodeURIComponent(a.id)}&filename=${encodeURIComponent(a.filename)}&mime=${encodeURIComponent(a.mimeType)}`;
    return download ? `${base}&download=1` : base;
  }

  function openLightbox(a: { id: string; filename: string; mimeType: string }) {
    setScale(1);
    setLightbox({ src: attachmentHref(a), name: a.filename, download: attachmentHref(a, true) });
  }

  const images = (detail?.attachments || []).filter((a) => String(a.mimeType || "").startsWith("image/"));
  const files = (detail?.attachments || []).filter((a) => !String(a.mimeType || "").startsWith("image/"));

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Messages</h2>
        <button onClick={onRefresh} disabled={loading} className="px-3 py-1.5 text-xs rounded-lg bg-purple-600/30 border border-purple-500/40 text-purple-200 hover:bg-purple-600/50 disabled:opacity-50">Refresh</button>
      </div>

      {connected ? (
        <>
          <div className="divide-y divide-white/5 max-h-[620px] overflow-auto">
            {messages.map((m) => {
              const open = selected === m.id;
              return (
                <div key={m.id}>
                  <button onClick={() => toggle(m.id)} className={`w-full text-left px-5 py-3 hover:bg-white/5 transition-colors ${open ? "bg-white/5" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${m.unread ? "text-white" : "text-white/80"}`}>
                          {m.unread && <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-2 align-middle" />}
                          {m.subject || "(no subject)"}
                        </p>
                        <p className="text-xs text-purple-200/50 mt-0.5 truncate">{m.from} → {m.to}</p>
                        {!open && <p className="text-xs text-purple-200/40 mt-1 line-clamp-2">{m.snippet}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-purple-200/30 whitespace-nowrap">{m.date}</span>
                        <svg className={`w-4 h-4 text-purple-300 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div className="px-5 pb-5 pt-1 bg-black/20 border-t border-white/5">
                      {detailLoading && <p className="text-sm text-purple-200/40 py-3">Loading…</p>}
                      {detail && (
                        <>
                          <div className="text-xs text-purple-200/50 mb-3">
                            <p>{detail.from}</p>
                            <p>to {detail.to} · {detail.date}</p>
                          </div>
                          <div className="rounded-lg bg-black/20 border border-white/10 p-3 max-h-[460px] overflow-auto">
                            <pre className="whitespace-pre-wrap text-xs text-white/85 font-sans break-words">{detail.body}</pre>
                            {images.length > 0 && (
                              <div className="mt-3 space-y-3">
                                {images.map((a) => (
                                  <button key={a.id} type="button" onClick={() => openLightbox(a)} className="block w-full">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={attachmentHref(a)} alt={a.filename} className="max-h-72 w-auto mx-auto rounded-lg border border-white/10 hover:ring-2 hover:ring-purple-400/50 cursor-zoom-in" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {files.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {files.map((a) => (
                                <a key={a.id} href={attachmentHref(a, true)} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white/85 hover:bg-white/10">
                                  <svg className="w-4 h-4 text-purple-300 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                                  </svg>
                                  <span className="truncate">{a.filename}</span>
                                  <span className="text-[10px] text-purple-200/40">{Math.round((a.size || 0) / 1024)} KB</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {messages.length === 0 && !loading && !error && (
              <p className="px-5 py-6 text-sm text-purple-200/40">{emptyText}</p>
            )}
            {error && (
              <div className="px-5 py-4">
                <p className="text-sm text-red-300 whitespace-pre-wrap">{error}</p>
              </div>
            )}
            {loading && <div className="px-5 py-6 text-center text-sm text-purple-200/40">Loading...</div>}
          </div>
          {next && (
            <div className="px-5 py-3 border-t border-white/10">
              <button onClick={onLoadMore} className="w-full px-4 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10">Load more</button>
            </div>
          )}
        </>
      ) : (
        <p className="px-5 py-6 text-sm text-purple-200/40">Connect Gmail and ensure you have access.</p>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="absolute top-4 right-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setScale((s) => Math.max(0.25, +(s - 0.25).toFixed(2)))} className="w-9 h-9 grid place-items-center rounded-lg bg-white/10 border border-white/15 text-white hover:bg-white/20" title="Zoom out">−</button>
            <button onClick={() => setScale(1)} className="px-3 h-9 grid place-items-center rounded-lg bg-white/10 border border-white/15 text-white text-xs hover:bg-white/20">{Math.round(scale * 100)}%</button>
            <button onClick={() => setScale((s) => Math.min(5, +(s + 0.25).toFixed(2)))} className="w-9 h-9 grid place-items-center rounded-lg bg-white/10 border border-white/15 text-white hover:bg-white/20" title="Zoom in">+</button>
            <a href={lightbox.download} className="h-9 px-3 inline-flex items-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Download
            </a>
            <button onClick={() => setLightbox(null)} className="w-9 h-9 grid place-items-center rounded-lg bg-white/10 border border-white/15 text-white hover:bg-white/20" title="Close">×</button>
          </div>
          <div className="overflow-auto max-h-[90vh] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox.src} alt={lightbox.name} style={{ transform: `scale(${scale})`, transformOrigin: "center center" }} className="transition-transform" />
          </div>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/60 bg-black/40 px-3 py-1 rounded-full">{lightbox.name}</p>
        </div>
      )}
    </div>
  );
}
