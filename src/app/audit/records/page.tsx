"use client";

import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function AuditRecords() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Navbar />

      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/audit" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back to Audit Management
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">Audit Records</h1>
        <p className="text-blue-200/60 mb-10">Record an audit from your notes and generate findings</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/audit/records/iso9001">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all duration-200 cursor-pointer group text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-blue-600/20 border border-blue-500/30 mb-4 group-hover:bg-blue-600/30 transition-colors">
                <span className="text-blue-400 font-bold text-sm">9001</span>
              </div>
              <h3 className="text-white font-semibold">ISO 9001</h3>
            </div>
          </Link>
          <Link href="/audit/records/internal">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all duration-200 cursor-pointer group text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-purple-600/20 border border-purple-500/30 mb-4 group-hover:bg-purple-600/30 transition-colors">
                <span className="text-purple-400 font-bold text-sm">INT</span>
              </div>
              <h3 className="text-white font-semibold">Internal</h3>
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}