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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
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

        <div className="flex justify-center">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
            <Link href="/audit" className="block">
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all duration-200 cursor-pointer group text-center h-full">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-blue-600/20 border border-blue-500/30 mb-4 group-hover:bg-blue-600/30 transition-colors">
                  <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold mb-1">Audit Management</h3>
              </div>
            </Link>
            <Link href="/capa" className="block">
              <div className="bg-white/5 backdrop-blur-sm border border-amber-500/20 rounded-xl p-6 hover:bg-white/10 transition-all duration-200 cursor-pointer group text-center h-full">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-amber-500/20 border border-amber-500/30 mb-4 group-hover:bg-amber-500/30 transition-colors">
                  <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                  </svg>
                </div>
                <h3 className="text-white font-semibold mb-1">Root Causes and CAPA</h3>
              </div>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
