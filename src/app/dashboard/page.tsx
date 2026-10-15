"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

export default function Dashboard() {
  const supabase = createClient();
  const [displayName, setDisplayName] = useState("Admin");
  const [counts, setCounts] = useState<{ total: number; recent: number; read: number; unread: number } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setDisplayName(data.user.user_metadata?.full_name || "Admin");
      }
    });
    fetch("/api/gmail/counts")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.ok) setCounts({ total: j.total, recent: j.recent, read: j.read, unread: j.unread });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950">
      <Navbar />

      <main className="max-w-7xl mx-auto px-6 py-16 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-blue-600/20 border border-blue-500/30 mb-6">
          <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
        </div>
        <h1 className="text-4xl font-bold text-white mb-2">
          Welcome, {displayName}!
        </h1>
        <p className="text-lg text-blue-200/70 mb-12">
          You are now signed in to the Quality Management System.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <Link href="/audit" className="block w-full max-w-sm mx-auto">
            <div className="bg-gradient-to-br from-blue-600/15 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-blue-400/25 rounded-xl p-6 shadow-lg shadow-blue-950/40 hover:border-blue-300/50 hover:from-blue-500/25 transition-all duration-300 hover:-translate-y-1 cursor-pointer group text-center h-full">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-blue-600/20 border border-blue-500/30 mb-4 group-hover:bg-blue-600/30 transition-colors">
                <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1">Audit Management</h3>
            </div>
          </Link>
          <Link href="/visit" className="block w-full max-w-sm mx-auto">
            <div className="bg-gradient-to-br from-emerald-600/15 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-emerald-400/25 rounded-xl p-6 shadow-lg shadow-blue-950/40 hover:border-emerald-300/50 hover:from-emerald-500/25 transition-all duration-300 hover:-translate-y-1 cursor-pointer group text-center h-full">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-emerald-600/20 border border-emerald-500/30 mb-4 group-hover:bg-emerald-600/30 transition-colors">
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1">Visit Management</h3>
            </div>
          </Link>
          <Link href="/hazard-risk" className="block w-full max-w-sm mx-auto">
            <div className="bg-gradient-to-br from-amber-600/15 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-amber-400/25 rounded-xl p-6 shadow-lg shadow-blue-950/40 hover:border-amber-300/50 hover:from-amber-500/25 transition-all duration-300 hover:-translate-y-1 cursor-pointer group text-center h-full">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-amber-600/20 border border-amber-500/30 mb-4 group-hover:bg-amber-600/30 transition-colors">
                <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1">Hazard &amp; Risk Analysis (OSHA)</h3>
            </div>
          </Link>
          <Link href="/emails-management" className="block w-full max-w-sm mx-auto">
            <div className="bg-gradient-to-br from-purple-600/15 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-purple-400/25 rounded-xl p-6 shadow-lg shadow-blue-950/40 hover:border-purple-300/50 hover:from-purple-500/25 transition-all duration-300 hover:-translate-y-1 cursor-pointer group text-center h-full">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-purple-600/20 border border-purple-500/30 mb-4 group-hover:bg-purple-600/30 transition-colors">
                <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1">Email View</h3>
              {counts && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3">
                  <span className="px-2 py-0.5 text-[10px] rounded-full border bg-white/5 text-purple-200/80 border-white/10">
                    {counts.total} total
                  </span>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full border ${counts.recent > 0 ? "bg-emerald-500/15 text-emerald-200 border-emerald-400/30" : "bg-white/5 text-purple-200/40 border-white/10"}`}>
                    {counts.recent} new
                  </span>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full border ${counts.unread > 0 ? "bg-amber-500/15 text-amber-200 border-amber-400/30" : "bg-white/5 text-purple-200/40 border-white/10"}`}>
                    {counts.unread} unread
                  </span>
                  <span className="px-2 py-0.5 text-[10px] rounded-full border bg-white/5 text-purple-200/60 border-white/10">
                    {counts.read} read
                  </span>
                </div>
              )}
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
