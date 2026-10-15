"use client";

import { useEffect, useState } from "react";

interface TodayItem {
  branch: string;
  auditor: string;
  detail: string;
  status: string;
}

function localDateString(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PublicTodayAudit() {
  const [items, setItems] = useState<TodayItem[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/today-schedule?date=${localDateString()}`, { cache: "no-store" });
        const json = await res.json();
        if (active) setItems(Array.isArray(json?.items) ? json.items : []);
      } catch {
        if (active) setItems([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-400/30 bg-blue-500/10 text-xs text-blue-200 max-w-[60vw]">
      <span className="font-semibold text-white shrink-0">Audit today:</span>
      <span className="inline-flex items-center gap-2 overflow-hidden">
        {items.map((it, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 truncate">
            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-400/30 text-[10px] font-semibold shrink-0">
              Audit
            </span>
            <span className="font-medium text-white truncate">{it.branch}</span>
            <span className="text-blue-200/60 truncate">{it.auditor}</span>
            {i < items.length - 1 ? <span className="text-blue-200/30">·</span> : null}
          </span>
        ))}
      </span>
    </div>
  );
}
