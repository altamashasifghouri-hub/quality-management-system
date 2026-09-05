"use client";

import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function Iso9001Report() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Navbar />

      <main className="max-w-4xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/audit/report" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back to Audit Report
          </Link>
        </div>

        <div className="max-w-md mx-auto bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-12 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-blue-600/20 border border-blue-500/30 mb-4">
            <span className="text-blue-400 font-bold text-lg">9001</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">ISO 9001 Report</h1>
          <p className="text-blue-200/60">Coming soon. The ISO 9001 report format has not been defined yet.</p>
        </div>
      </main>
    </div>
  );
}