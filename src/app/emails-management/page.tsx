"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import GmailMessages, { type GmailMsgMeta } from "@/components/GmailMessages";

interface Status {
  connected: boolean;
  connectedBy?: string;
  email?: string;
  senderFilter?: string;
  viewers?: string[];
  isOwner?: boolean;
  allowed?: boolean;
  isPublic?: boolean;
}

export default function EmailsManagementPage() {
  const [status, setStatus] = useState<Status>({ connected: false });
  const [sender, setSender] = useState("");
  const [viewer, setViewer] = useState("");
  const [viewers, setViewers] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [messages, setMessages] = useState<GmailMsgMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    const res = await fetch("/api/gmail/status");
    const j = await res.json();
    setStatus(j);
    if (j.senderFilter) setSender(j.senderFilter);
    if (j.viewers) setViewers(j.viewers);
    setIsPublic(Boolean(j.isPublic));
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (status.connected && status.allowed) fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.connected, status.allowed]);

  async function fetchMessages(token?: string) {
    setLoading(true);
    setError(null);
    const url = token ? `/api/gmail/messages?pageToken=${encodeURIComponent(token)}` : "/api/gmail/messages";
    const res = await fetch(url);
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (j.ok) {
      setMessages((m) => (token ? [...m, ...j.messages] : j.messages));
      setNext(j.nextPageToken || null);
    } else {
      if (j.needsReconnect) setError("Gmail needs to be reconnected. Click Connect Gmail again.");
      else if (j.status === 403) setError("Gmail API rejected the request (403). Usually the Gmail API is not enabled for this Google Cloud project, or the gmail.readonly scope was not granted. " + (j.error || ""));
      else if (j.status === 401) setError(j.error || "Gmail authorization failed. Try reconnecting.");
      else if (j.status) setError((j.error || "Gmail request failed") + " (HTTP " + j.status + ")");
      else if (j.allowed === false) setError("You don't have access to this mailbox.");
      else setError("Could not load messages.");
    }
  }

  async function saveSettings() {
    await fetch("/api/gmail/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender_filter: sender, viewers, is_public: isPublic }),
    });
    fetchStatus();
  }

  async function addViewer() {
    if (!viewer.includes("@")) return;
    const v = viewers.includes(viewer) ? viewers : [...viewers, viewer];
    setViewers(v);
    setViewer("");
    await saveSettings();
  }

  async function rmViewer(e: string) {
    const v = viewers.filter((x) => x !== e);
    setViewers(v);
    await saveSettings();
  }

  async function disconnect() {
    await fetch("/api/gmail/disconnect", { method: "POST" });
    setStatus({ connected: false });
    setMessages([]);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-900/20 to-slate-950">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="mb-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to Dashboard
          </Link>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Email View</h1>
            <p className="text-purple-200/60">Connect your Gmail; show only the conversation thread with a specific sender (their mails + your replies). Live fetch, read-only. </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-purple-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-purple-400/20 rounded-2xl p-6 h-fit lg:sticky lg:top-6">
            <h2 className="text-lg font-semibold text-white mb-4">Connection &amp; Access</h2>
            {!status.connected ? (
              <div className="space-y-3">
                <a href="/api/gmail/auth" className="w-full block text-center px-5 py-3 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors">Connect Gmail</a>
                <p className="text-[11px] text-purple-200/40">Connects your Gmail (separate account). After enabling Gmail API and the gmail.readonly scope in Google Cloud, click Connect Gmail and sign in with that account.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-white/80">Connected: {status.email || "—"}</p>
                <p className="text-xs text-purple-200/40">Connected by: {status.isOwner ? "You" : status.connectedBy}</p>

                {status.isOwner && (
                  <>
                    <div>
                      <label className="block text-sm text-purple-200/70 mb-1">Sender filter (email or raw Gmail query)</label>
                      <input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="e.g. hassanateeq@gmail.com, hr@hamsun.pk" className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm" />
                      <p className="text-[11px] text-purple-200/40 mt-1">One or more emails (comma-separated), or a raw Gmail query. For each email we include both their messages and your replies.</p>
                    </div>
                    <div>
                      <label className="block text-sm text-purple-200/70 mb-1">Allow portal users to view (by email)</label>
                      <div className="flex gap-2">
                        <input value={viewer} onChange={(e) => setViewer(e.target.value)} placeholder="user@domain.com" className="flex-1 px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm" />
                        <button onClick={addViewer} className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm">Add</button>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {viewers.map((v) => (
                          <span key={v} className="px-2 py-0.5 text-xs rounded-full bg-white/10 border border-white/15 text-white/80">{v} <button onClick={() => rmViewer(v)} className="text-purple-300 ml-1">×</button></span>
                        ))}
                      </div>
                    </div>
                    <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${isPublic ? "bg-purple-600/20 border-purple-400/40" : "bg-white/5 border-white/10"}`}>
                      <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="mt-0.5" />
                      <span>
                        <span className="block text-sm text-white">Make public (no login required)</span>
                        <span className="block text-[11px] text-purple-200/50 mt-0.5">Anyone opening the public portal can read this mailbox (only the emails matching your sender filter). Use with care.</span>
                      </span>
                    </label>
                    {isPublic && (
                      <a href="/public/emails" target="_blank" rel="noopener noreferrer" className="block text-xs text-purple-300 hover:text-purple-200">Open public email view →</a>
                    )}
                    <button onClick={saveSettings} className="w-full px-5 py-2.5 bg-purple-600/40 hover:bg-purple-600/60 text-white rounded-lg text-sm">Save Settings</button>
                    <button onClick={disconnect} className="w-full px-5 py-2.5 text-sm text-red-400/80 hover:text-red-300 bg-white/5 border border-white/10 rounded-lg">Disconnect Gmail</button>
                  </>
                )}
                {!status.allowed && !status.isOwner && (
                  <p className="text-sm text-red-300">You don't have access to view this mailbox.</p>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <GmailMessages
              messages={messages}
              next={next}
              loading={loading}
              error={error}
              onLoadMore={() => fetchMessages(next || undefined)}
              onRefresh={() => fetchMessages()}
              endpointBase="/api/gmail"
              connected={Boolean(status.connected && status.allowed)}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
