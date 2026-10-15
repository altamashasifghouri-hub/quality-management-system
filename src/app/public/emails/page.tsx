"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import GmailMessages, { type GmailMsgMeta } from "@/components/GmailMessages";

export default function PublicEmailsPage() {
  const [messages, setMessages] = useState<GmailMsgMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);

  const fetchMessages = useCallback(async (token?: string) => {
    setLoading(true);
    setError(null);
    const url = token ? `/api/gmail/public/messages?pageToken=${encodeURIComponent(token)}` : "/api/gmail/public/messages";
    try {
      const res = await fetch(url);
      const j = await res.json().catch(() => ({}));
      if (j.ok) {
        setMessages((m) => (token ? [...m, ...j.messages] : j.messages));
        setNext(j.nextPageToken || null);
        setAvailable(true);
      } else if (j.connected === false) {
        setAvailable(false);
      } else if (j.status === 403) {
        setError("Gmail API rejected the request. " + (j.error || ""));
      } else {
        setError(j.error || "Could not load messages.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-900/20 to-slate-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-6">
          <Link href="/public" className="inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to Public
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-white mb-6">Emails</h1>
        {available ? (
          <GmailMessages
            messages={messages}
            next={next}
            loading={loading}
            error={error}
            onLoadMore={() => fetchMessages(next || undefined)}
            onRefresh={() => fetchMessages()}
            endpointBase="/api/gmail/public"
            emptyText="No messages published yet."
            connected
          />
        ) : (
          <p className="text-sm text-purple-200/50">No public mailbox is available.</p>
        )}
      </div>
    </div>
  );
}
