"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import type { EvidenceItem } from "@/lib/evidence";

function ThreedTile({ src }: { src: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement as HTMLElement | null;
    if (!canvas || !host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 3.2);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const texture = new THREE.TextureLoader().load(src);
    texture.colorSpace = THREE.SRGBColorSpace;

    const geo = new THREE.PlaneGeometry(2, 2);
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.82, metalness: 0.04 });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 2, 4);
    scene.add(key);
    const glare = new THREE.PointLight(0x5ec7ff, 2.2, 6);
    scene.add(glare);

    const fit = () => {
      const img = texture.image as HTMLImageElement | null;
      const w = img?.naturalWidth || 1;
      const h = img?.naturalHeight || 1;
      const a = w / h;
      mesh.scale.set(a > 1 ? 1 : a, a > 1 ? 1 / a : 1, 1);
    };
    if (texture.image) fit();
    else texture.addEventListener("load", fit);

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    const loop = () => {
      const img = texture.image as HTMLImageElement | null;
      const w = img?.naturalWidth || 1;
      const h = img?.naturalHeight || 1;
      const a = w / h;
      const zoomN = mesh.scale.x / (a > 1 ? 1 : a);
      const ns = zoomN + (1.1 - zoomN) * 0.12;
      mesh.scale.set(ns * (a > 1 ? 1 : a), ns * (a > 1 ? 1 / a : 1), 1);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      geo.dispose();
      mat.dispose();
      texture.dispose();
      renderer.dispose();
      scene.remove(mesh);
    };
  }, [src]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden />;
}

function Tile({
  item,
  index,
  total,
  onOpen,
}: {
  item: EvidenceItem;
  index: number;
  total: number;
  onOpen: () => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={onOpen}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onPointerOut={() => setHover(false)}
      className="group relative h-48 sm:h-64 rounded-xl overflow-hidden border border-white/10 bg-black/30 hover:ring-2 hover:ring-blue-400/60 transition-all cursor-pointer"
    >
      <img
        src={item.thumb}
        alt={item.caption}
        loading="lazy"
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className={`absolute inset-0 transition-opacity duration-300 ${hover ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        {hover ? <ThreedTile src={item.thumb} /> : null}
      </div>

      {item.kind === "video" ? (
        <span className="absolute top-2.5 right-2.5 w-9 h-9 rounded-full bg-black/60 border border-white/25 text-white flex items-center justify-center backdrop-blur-sm">
          <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
        </span>
      ) : null}

      <span className="absolute inset-x-0 bottom-0 py-1.5 bg-gradient-to-t from-black/80 to-transparent text-center text-[11px] text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
        {item.caption}
      </span>
    </button>
  );
}

export default function EvidenceGallery({ items, label }: { items: EvidenceItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; sx: number; sy: number } | null>(null);
  const suppress = useRef(false);

  const imageItems = items.filter((i) => i.kind !== "audio");
  const audioItems = items.filter((i) => i.kind === "audio");

  const close = () => {
    setOpen(false);
    setZoom(1);
    setPos({ x: 0, y: 0 });
    suppress.current = false;
  };

  const onBackdropClick = (e: React.MouseEvent) => {
    if (suppress.current) {
      suppress.current = false;
      return;
    }
    if (e.target === e.currentTarget) close();
  };

  const go = (dir: number) => {
    if (imageItems.length === 0) return;
    setIdx((i) => (i + dir + imageItems.length) % imageItems.length);
    setZoom(1);
    setPos({ x: 0, y: 0 });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, imageItems.length]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (imageItems.length === 0 && audioItems.length === 0) return null;

  const item = imageItems[idx];

  return (
    <>
      {imageItems.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {imageItems.map((it, i) => (
            <Tile
              key={i}
              item={it}
              index={i}
              total={imageItems.length}
              onOpen={() => {
                setIdx(i);
                setZoom(1);
                setPos({ x: 0, y: 0 });
                suppress.current = false;
                setOpen(true);
              }}
            />
          ))}
        </div>
      ) : null}

      {audioItems.map((a, i) => (
        <div
          key={`a${i}`}
          className="flex flex-wrap sm:flex-nowrap items-center gap-3 bg-white/[0.04] border border-white/10 rounded-xl p-3 mt-3"
        >
          <img src={a.thumb} alt="Voice note" className="h-10 w-12 rounded-md object-cover shrink-0" />
          <div className="min-w-0 flex-1 w-full">
            <p className="text-[11px] text-blue-200/70 mb-1">{a.caption}</p>
            <audio controls preload="none" src={a.src} className="w-full h-9" />
          </div>
        </div>
      ))}

      {open && item
        ? createPortal(
<div
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 sm:p-8"
                onClick={onBackdropClick}
                role="dialog"
                aria-modal="true"
              >
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 text-xs text-white/70">
            <span className="bg-white/10 border border-white/15 rounded-full px-3 py-1">
              {idx + 1} / {imageItems.length}
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

          {imageItems.length > 1 ? (
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

          {item.kind === "video" ? (
            <div className="max-w-[94vw] max-h-[92vh] rounded-xl overflow-hidden ring-1 ring-white/10" style={{ maxWidth: 960 }} onClick={(e) => e.stopPropagation()}>
              <video key={item.src} controls autoPlay playsInline src={item.src} className="max-h-[80vh] w-full object-contain bg-black" />
            </div>
          ) : item.kind === "audio" ? (
            <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl p-6 flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
              <img src={item.thumb} alt="Voice note" className="h-24 rounded-lg" />
              <audio controls autoPlay src={item.src} className="w-full" />
            </div>
          ) : (
            <div
              className="max-w-[94vw] max-h-[92vh] overflow-hidden rounded-lg bg-black/60 ring-1 ring-white/10"
              onClick={(e) => e.stopPropagation()}
              onWheel={(e) => {
                e.preventDefault();
                setZoom((z) => Math.min(5, Math.max(1, z + (e.deltaY < 0 ? 0.2 : -0.2))));
              }}
            >
              <img
                src={item.src}
                alt={item.caption}
                draggable={false}
                onMouseDown={(e) => {
                  drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y, sx: e.clientX, sy: e.clientY };
                }}
                onMouseMove={(e) => {
                  if (!drag.current || zoom <= 1) return;
                  setPos({
                    x: drag.current.ox + (e.clientX - drag.current.x) / zoom,
                    y: drag.current.oy + (e.clientY - drag.current.y) / zoom,
                  });
                }}
                onMouseUp={(e) => {
                  const d = drag.current;
                  drag.current = null;
                  if (d && (Math.abs(e.clientX - d.sx) > 5 || Math.abs(e.clientY - d.sy) > 5)) suppress.current = true;
                }}
                onMouseLeave={() => (drag.current = null)}
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  drag.current = { x: t.clientX, y: t.clientY, ox: pos.x, oy: pos.y, sx: t.clientX, sy: t.clientY };
                }}
                onTouchMove={(e) => {
                  if (!drag.current || zoom <= 1) return;
                  const t = e.touches[0];
                  setPos({
                    x: drag.current.ox + (t.clientX - drag.current.x) / zoom,
                    y: drag.current.oy + (t.clientY - drag.current.y) / zoom,
                  });
                }}
                onTouchEnd={(e) => {
                  const t = e.changedTouches[0];
                  const d = drag.current;
                  drag.current = null;
                  if (d && (Math.abs(t.clientX - d.sx) > 5 || Math.abs(t.clientY - d.sy) > 5)) suppress.current = true;
                }}
                className="max-w-[94vw] max-h-[92vh] object-contain select-none cursor-grab active:cursor-grabbing touch-none"
                style={{ transform: `scale(${zoom}) translate(${pos.x}px, ${pos.y}px)`, transformOrigin: "center" }}
              />
            </div>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
            {item.kind === "image" ? (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoom((z) => Math.max(1, z - 0.25));
                  }}
                  aria-label="Zoom out"
                  className="w-9 h-9 rounded-full text-white hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" /></svg>
                </button>
                <span className="w-14 text-center text-xs text-white/80 font-mono">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoom((z) => Math.min(5, z + 0.25));
                  }}
                  aria-label="Zoom in"
                  className="w-9 h-9 rounded-full text-white hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                </button>
                <span className="w-px h-6 bg-white/15" />
              </>
            ) : null}
            <a
              href={`${item.src}&download=1`}
              download
              aria-label="Download"
              onClick={(e) => e.stopPropagation()}
              className="w-9 h-9 rounded-full text-white hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
            </a>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}