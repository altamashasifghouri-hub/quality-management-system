"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

interface TodayItem {
  branch: string;
  auditor: string;
  detail: string;
  status: string;
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const [todayOpen, setTodayOpen] = useState(false);
  const [todayItems, setTodayItems] = useState<TodayItem[]>([]);
  const [todayLoading, setTodayLoading] = useState(false);
  const todayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
      if (todayRef.current && !todayRef.current.contains(e.target as Node)) setTodayOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setTodayLoading(true);
      try {
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const res = await fetch(`/api/today-schedule?date=${today}`, { cache: "no-store" });
        const json = await res.json();
        if (active) setTodayItems(Array.isArray(json?.items) ? json.items : []);
      } catch {
        if (active) setTodayItems([]);
      } finally {
        if (active) setTodayLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [todayOpen]);

  useEffect(() => {
    (async () => {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        const meta = data?.user?.user_metadata;
        setUserName(meta?.full_name || data?.user?.email?.split("@")[0] || "");
      } catch {
        setUserName("");
      }
    })();
  }, []);

  return (
    <nav className="border-b border-blue-500/20 bg-blue-950/60 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
        <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
          <span className="text-white font-semibold text-sm sm:text-base truncate">Quality Management System</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="relative" ref={todayRef}>
            <button
              onClick={() => setTodayOpen(!todayOpen)}
              className={`inline-flex items-center gap-2 px-2.5 sm:px-4 py-2 text-sm font-medium rounded-lg border border-white/10 transition-all duration-200 ${
                todayOpen ? "text-white bg-white/10" : "text-white/70 hover:text-white bg-white/5 hover:bg-white/10"
              }`}
              aria-label="Today's auditors"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              <span className="hidden sm:inline">Today</span>
              {todayItems.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-[10px] font-semibold text-white">
                  {todayItems.length}
                </span>
              )}
            </button>

            {todayOpen && (
              <div className="absolute right-0 mt-2 w-80 max-w-[85vw] bg-blue-950/95 backdrop-blur-md border border-blue-500/25 rounded-xl shadow-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">Today&rsquo;s Audits</span>
                  <span className="text-xs text-blue-200/60">
                    {new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
                <div className="max-h-80 overflow-y-auto py-1">
                  {todayLoading ? (
                    <p className="px-4 py-6 text-sm text-blue-200/60 text-center">Loading&hellip;</p>
                  ) : todayItems.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-blue-200/60 text-center">No audits scheduled for today.</p>
                  ) : (
                    todayItems.map((it, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-colors">
                        <span className="mt-0.5 shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full border bg-blue-500/15 text-blue-200 border-blue-400/30">
                          Audit
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm text-white font-medium leading-snug break-words">{it.branch}</p>
                          <p className="text-xs text-blue-200/70 leading-snug break-words">{it.auditor}</p>
                          {it.detail ? <p className="text-[11px] text-blue-200/40 mt-0.5 break-words">{it.detail}</p> : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen(!open)}
              className={`inline-flex items-center gap-2 px-2.5 sm:px-4 py-2 text-sm font-medium rounded-lg border border-white/10 transition-all duration-200 ${
                open ? "text-white bg-white/10" : "text-white/70 hover:text-white bg-white/5 hover:bg-white/10"
              }`}
              aria-label="Settings"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              <span className="hidden sm:inline">Settings</span>
              <svg className={`hidden sm:block w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {open && (
              <div className="absolute right-0 mt-2 w-56 bg-blue-950/95 backdrop-blur-md border border-blue-500/25 rounded-xl shadow-2xl py-2 z-50">
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                  User Settings
                </Link>
                <Link
                  href="/branches"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21h3.75M12 21V9.5m0 0L12 9.5m0 0 4.125 3.375M12 9.5 7.875 12.875" />
                  </svg>
                  Branches
                </Link>
                <Link
                  href="/storage"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-white/80 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                  </svg>
                  Storage
                </Link>
              </div>
            )}
          </div>

          {userName && <span className="hidden md:block text-sm text-white font-medium">{userName}</span>}

          <button
            type="button"
            aria-label="Sign out"
            onClick={async () => {
              const { createClient } = await import("@/lib/supabase/client");
              const supabase = createClient();
              await supabase.auth.signOut();
              window.location.href = "/auth/signin";
            }}
            className="inline-flex items-center gap-2 px-2.5 sm:px-4 py-2 text-sm text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all duration-200"
          >
            <svg className="w-4 h-4 sm:hidden" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
