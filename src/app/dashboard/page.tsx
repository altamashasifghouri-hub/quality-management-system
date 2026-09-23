"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

export default function Dashboard() {
  const supabase = createClient();
  const [displayName, setDisplayName] = useState("Admin");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setDisplayName(data.user.user_metadata?.full_name || "Admin");
      }
    });
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
          <Link href="/audit/progress" className="block w-full max-w-sm mx-auto">
            <div className="bg-gradient-to-br from-emerald-600/15 via-blue-900/20 to-slate-900/50 backdrop-blur-md border border-emerald-400/25 rounded-xl p-6 shadow-lg shadow-blue-950/40 hover:border-emerald-300/50 hover:from-emerald-500/25 transition-all duration-300 hover:-translate-y-1 cursor-pointer group text-center h-full">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-emerald-600/20 border border-emerald-500/30 mb-4 group-hover:bg-emerald-600/30 transition-colors">
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1">Progress</h3>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
