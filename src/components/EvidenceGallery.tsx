"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function EvidenceGallery({ images, label }: { images: string[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setZoom(1);
    setPos({ x: 0, y: 0 });
  }, []);

  const go = useCallback(
    (dir: number) => {
      if (images.length === 0) return;
      setIdx((i) => (i + dir + images.length) % images.length);
      setZoom(1);
      setPos({ x: 0, y: 0 });
    },
    [images.length]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, go]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (images.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-2.5">
        {images.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              setIdx(i);
              setZoom(1);
              setPos({ x: 0, y: 0 });
              setOpen(true);
            }}
            className="group relative h-36 sm:h-40 rounded-xl overflow-hidden border border-white/10 bg-black/30 hover:ring-2 hover:ring-blue-400/60 transition-all"
          >
            <img src={src} alt={`${label || "Evidence"} ${i + 1}`} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
            <span className="absolute inset-x-0 bottom-0 py-1.5 bg-gradient-to-t from-black/70 to-transparent text-center text-[10px] text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
              Click to view
            </span>
          </button>
        ))}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 sm:p-8"
          onClick={close}
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 text-xs text-white/70">
            <span className="bg-white/10 border border-white/15 rounded-full px-3 py-1">
              {idx + 1} / {images.length}
            </span>
          </div>

          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 border border-white/15 text-white hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>

          {images.length > 1 ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(-1);
                }}
                aria-label="Previous image"
                className="absolute left-3 sm:left-6 z-10 w-11 h-11 rounded-full bg-white/10 border border-white/15 text-white hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m15 19-7-7 7-7" /></svg>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(1);
                }}
                aria-label="Next image"
                className="absolute right-3 sm:right-6 z-10 w-11 h-11 rounded-full bg-white/10 border border-white/15 text-white hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" /></svg>
              </button>
            </>
          ) : null}

          <div
            className="max-w-[94vw] max-h-[92vh] overflow-hidden rounded-lg bg-black/60 ring-1 ring-white/10"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => {
              e.preventDefault();
              setZoom((z) => Math.min(5, Math.max(1, z + (e.deltaY < 0 ? 0.2 : -0.2))));
            }}
          >
            <img
              src={images[idx]}
              alt={`${label || "Evidence"} ${idx + 1}`}
              draggable={false}
              onMouseDown={(e) => {
                drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
              }}
              onMouseMove={(e) => {
                if (!drag.current || zoom <= 1) return;
                setPos({
                  x: drag.current.ox + (e.clientX - drag.current.x) / zoom,
                  y: drag.current.oy + (e.clientY - drag.current.y) / zoom,
                });
              }}
              onMouseUp={() => (drag.current = null)}
              onMouseLeave={() => (drag.current = null)}
              onTouchStart={(e) => {
                const t = e.touches[0];
                drag.current = { x: t.clientX, y: t.clientY, ox: pos.x, oy: pos.y };
              }}
              onTouchMove={(e) => {
                if (!drag.current || zoom <= 1) return;
                const t = e.touches[0];
                setPos({
                  x: drag.current.ox + (t.clientX - drag.current.x) / zoom,
                  y: drag.current.oy + (t.clientY - drag.current.y) / zoom,
                });
              }}
              onTouchEnd={() => (drag.current = null)}
              className="max-w-[94vw] max-h-[92vh] object-contain select-none cursor-grab active:cursor-grabbing touch-none"
              style={{ transform: `scale(${zoom}) translate(${pos.x}px, ${pos.y}px)`, transformOrigin: "center" }}
            />
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full px-2 py-1.5">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
              aria-label="Zoom out"
              className="w-9 h-9 rounded-full text-white hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
            </button>
            <span className="w-14 text-center text-xs text-white/80 font-mono">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(5, z + 0.25))}
              aria-label="Zoom in"
              className="w-9 h-9 rounded-full text-white hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            </button>
            <span className="w-px h-6 bg-white/15" />
            <a
              href={`${images[idx]}&download=1`}
              download
              aria-label="Download image"
              className="w-9 h-9 rounded-full text-white hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            </a>
          </div>
        </div>
      ) : null}
    </>
  );
}