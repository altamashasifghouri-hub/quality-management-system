"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export default function ThreedCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const axis = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const active = useRef(false);
  const [engaged, setEngaged] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onPointer = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      axis.current.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      axis.current.ty = -(((e.clientY - r.top) / r.height) * 2 - 1);
    };
    const onEnter = () => {
      active.current = true;
      setEngaged(true);
    };
    const onLeave = () => {
      active.current = false;
      axis.current.tx = 0;
      axis.current.ty = 0;
      setEngaged(false);
      wrap.style.setProperty("--tx", "0deg");
      wrap.style.setProperty("--ty", "0deg");
      wrap.style.setProperty("--sc", "1");
      wrap.style.boxShadow = "0 12px 40px -20px rgba(0,0,0,0.7)";
    };
    wrap.addEventListener("pointerenter", onEnter);
    wrap.addEventListener("pointerleave", onLeave);
    wrap.addEventListener("pointermove", onPointer);
    return () => {
      wrap.removeEventListener("pointerenter", onEnter);
      wrap.removeEventListener("pointerleave", onLeave);
      wrap.removeEventListener("pointermove", onPointer);
    };
  }, []);

  useEffect(() => {
    if (!engaged) return;
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 4;

    const makeTexture = (draw: (ctx: CanvasRenderingContext2D, s: number) => void) => {
      const el = document.createElement("canvas");
      el.width = el.height = 256;
      const ctx = el.getContext("2d")!;
      draw(ctx, 256);
      const t = new THREE.CanvasTexture(el);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };

    const spotTex = makeTexture((ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.35, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
    const bandTex = makeTexture((ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, s, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,255,255,0.9)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
    const aurTex = makeTexture((ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, "rgba(56,189,248,0.85)");
      g.addColorStop(0.4, "rgba(129,140,248,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
    const ringTex = makeTexture((ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, "rgba(56,189,248,0.95)");
      g.addColorStop(0.5, "rgba(233,213,255,0.85)");
      g.addColorStop(1, "rgba(34,211,238,0.95)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 30;
      ctx.globalAlpha = 1;
      ctx.strokeRect(14, 14, 228, 228);
    });

    const add = (map: THREE.Texture, opacity: number) =>
      new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );

    const spot = add(spotTex, 0);
    scene.add(spot);
    const band = add(bandTex, 0);
    scene.add(band);
    const aurA = add(aurTex, 0);
    scene.add(aurA);
    const aurB = add(aurTex, 0);
    scene.add(aurB);
    const ring = add(ringTex, 0);
    ring.material.side = THREE.DoubleSide;
    scene.add(ring);

    const N = 42;
    const positions = new Float32Array(N * 3);
    const seeds: number[] = [];
    for (let i = 0; i < N; i++) seeds.push(Math.random() * Math.PI * 2);
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const ptsMat = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.018,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particles = new THREE.Points(pgeo, ptsMat);
    scene.add(particles);

    let wu = 2;
    let fovH = 1.5;
    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fovH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.position.z;
      wu = fovH * camera.aspect;
      ring.scale.set(wu * 1.02, fovH * 1.02, 1);
      spot.scale.set(wu * 0.8, fovH * 0.8, 1);
      band.scale.set(wu * 0.4, fovH * 2.4, 1);
      aurA.scale.set(wu * 1.1, fovH * 1.1, 1);
      aurB.scale.set(wu * 1.0, fovH * 1.0, 1);
      particles.material.size = Math.max(0.012, fovH * 0.016);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    const loop = () => {
      axis.current.x += (axis.current.tx - axis.current.x) * 0.1;
      axis.current.y += (axis.current.ty - axis.current.y) * 0.1;
      const hx = axis.current.x;
      const hy = axis.current.y;
      const a = active.current ? 1 : 0;
      const t = 0.14;

      (spot.material as THREE.MeshBasicMaterial).opacity += (a * 0.32 - spot.material.opacity) * t;
      (band.material as THREE.MeshBasicMaterial).opacity += (a * 0.24 - band.material.opacity) * t;
      (aurA.material as THREE.MeshBasicMaterial).opacity += (a * 0.14 - aurA.material.opacity) * t;
      (aurB.material as THREE.MeshBasicMaterial).opacity += (a * 0.1 - aurB.material.opacity) * t;
      (ring.material as THREE.MeshBasicMaterial).opacity += (a * 0.85 - ring.material.opacity) * t;
      ptsMat.opacity += (a * 0.6 - ptsMat.opacity) * t;

      const now = performance.now();
      const sp = ((now * 0.0006) % 2) - 1;

      spot.position.set(hx * wu * 0.42, -hy * fovH * 0.46, 1.2);
      band.position.set(sp * wu * 0.7, 0, 1.1);
      band.rotation.z = 0.55;
      aurA.position.set(-hx * wu * 0.4, hy * fovH * 0.4, 1.05);
      aurB.position.set(hx * wu * 0.35, -hy * fovH * 0.35, 1.0);
      ring.position.z = 0.9;
      ring.rotation.z += 0.0014;

      const ppos = pgeo.attributes.position.array as Float32Array;
      for (let i = 0; i < N; i++) {
        ppos[i * 3] = hx * wu * 0.45 + Math.sin(seeds[i] * 3 + now * 0.00045) * wu * 0.5;
        ppos[i * 3 + 1] += 0.0006 * (0.6 + 0.4 * Math.sin(seeds[i]));
        if (ppos[i * 3 + 1] > fovH * 0.55) ppos[i * 3 + 1] = -fovH * 0.55;
        ppos[i * 3 + 2] = 0.98;
      }
      pgeo.attributes.position.needsUpdate = true;

      wrap.style.setProperty("--tx", `${(hx * 8).toFixed(2)}deg`);
      wrap.style.setProperty("--ty", `${(-hy * 8).toFixed(2)}deg`);
      wrap.style.setProperty("--sc", `${(1 + a * 0.02).toFixed(3)}`);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      pgeo.dispose();
      ptsMat.dispose();
      [ring, spot, band, aurA, aurB].forEach((m) => {
        m.geometry.dispose();
        (m.material as THREE.Material & { map?: THREE.Texture }).map?.dispose();
        (m.material as THREE.Material).dispose();
      });
      renderer.dispose();
    };
  }, [engaged]);

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden rounded-xl ${className || ""}`}
      style={{
        transform: "perspective(1100px) rotateX(var(--tx, 0deg)) rotateY(var(--ty, 0deg)) scale(var(--sc, 1))",
        transition: "transform 90ms linear, box-shadow 250ms ease",
        willChange: "transform",
        boxShadow: "0 12px 40px -20px rgba(0,0,0,0.7)",
      }}
      onPointerEnter={() => {
        const w = wrapRef.current;
        if (w)
          w.style.boxShadow =
            "0 30px 90px -20px rgba(37,99,235,0.6), 0 0 70px -8px rgba(34,211,238,0.4), 0 0 0 1px rgba(147,197,253,0.25)";
      }}
      onPointerLeave={() => {
        const w = wrapRef.current;
        if (w) w.style.boxShadow = "0 12px 40px -20px rgba(0,0,0,0.7)";
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 20 }}
        aria-hidden
      />
      <div className="relative" style={{ zIndex: 10 }}>
        {children}
      </div>
    </div>
  );
}