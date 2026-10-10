"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

function radialTexture(colors: string[]) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, colors[0]);
  g.addColorStop(0.35, colors[1]);
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function borderTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, "rgba(96,165,250,0.95)");
  g.addColorStop(0.5, "rgba(233,213,255,0.7)");
  g.addColorStop(1, "rgba(34,211,238,0.95)");
  ctx.strokeStyle = g;
  ctx.lineWidth = 24;
  ctx.globalAlpha = 0.95;
  ctx.strokeRect(14, 14, 228, 228);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 4;

    const makeSheen = (colors: string[]) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: radialTexture(colors),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      scene.add(m);
      return m;
    };
    const sheenA = makeSheen(["rgba(255,255,255,0.9)", "rgba(96,165,250,0.75)"]);
    const sheenB = makeSheen(["rgba(255,255,255,0.7)", "rgba(129,140,248,0.55)"]);
    const sheenC = makeSheen(["rgba(255,255,255,0.6)", "rgba(244,114,182,0.4)"]);

    const border = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: borderTexture(),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    scene.add(border);

    const N = 36;
    const positions = new Float32Array(N * 3);
    const seeds: number[] = [];
    for (let i = 0; i < N; i++) {
      seeds.push(Math.random() * Math.PI * 2);
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const ptsMat = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.02,
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
      border.scale.set(wu * 1.02, fovH * 1.02, 1);
      sheenA.scale.set(wu * 1.7, fovH * 1.7, 1);
      sheenB.scale.set(wu * 1.3, fovH * 1.3, 1);
      sheenC.scale.set(wu * 1.4, fovH * 1.4, 1);
      particles.material.size = Math.max(0.012, fovH * 0.014);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    const loop = () => {
      axis.current.x += (axis.current.tx - axis.current.x) * 0.09;
      axis.current.y += (axis.current.ty - axis.current.y) * 0.09;
      const hx = axis.current.x;
      const hy = axis.current.y;
      const a = active.current ? 1 : 0;
      const t = 0.12;
      (sheenA.material as THREE.MeshBasicMaterial).opacity += (a * 0.55 - sheenA.material.opacity) * t;
      (sheenB.material as THREE.MeshBasicMaterial).opacity += (a * 0.4 - sheenB.material.opacity) * t;
      (sheenC.material as THREE.MeshBasicMaterial).opacity += (a * 0.35 - sheenC.material.opacity) * t;
      (border.material as THREE.MeshBasicMaterial).opacity += (a * 0.95 - border.material.opacity) * t;
      ptsMat.opacity += (a * 0.9 - ptsMat.opacity) * t;

      sheenA.position.set(hx * wu * 0.34, -hy * fovH * 0.38, 0.3);
      sheenB.position.set(-hx * wu * 0.3, hy * fovH * 0.3, 0.32);
      sheenC.position.set(hx * wu * 0.2, hy * fovH * 0.42, 0.34);
      sheenA.rotation.z = -hx * 0.35;
      sheenB.rotation.z = hy * 0.28;
      sheenC.rotation.z = hx * 0.22;
      border.rotation.z += 0.0016;

      const ppos = pgeo.attributes.position.array as Float32Array;
      const now = performance.now();
      for (let i = 0; i < N; i++) {
        ppos[i * 3] = hx * wu * 0.45 + Math.sin(seeds[i] * 3 + now * 0.0004) * wu * 0.5;
        ppos[i * 3 + 1] += 0.0005 * (0.6 + 0.4 * Math.sin(seeds[i]));
        if (ppos[i * 3 + 1] > fovH * 0.55) ppos[i * 3 + 1] = -fovH * 0.55;
        ppos[i * 3 + 2] = 0.25;
      }
      pgeo.attributes.position.needsUpdate = true;

      wrap.style.setProperty("--tx", `${(hx * 7).toFixed(2)}deg`);
      wrap.style.setProperty("--ty", `${(-hy * 7).toFixed(2)}deg`);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onPointer = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      axis.current.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      axis.current.ty = -(((e.clientY - r.top) / r.height) * 2 - 1);
    };
    const onEnter = () => {
      active.current = true;
    };
    const onLeave = () => {
      active.current = false;
      axis.current.tx = 0;
      axis.current.ty = 0;
    };
    wrap.addEventListener("pointerenter", onEnter);
    wrap.addEventListener("pointerleave", onLeave);
    wrap.addEventListener("pointermove", onPointer);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointerenter", onEnter);
      wrap.removeEventListener("pointerleave", onLeave);
      wrap.removeEventListener("pointermove", onPointer);
      pgeo.dispose();
      ptsMat.dispose();
      border.geometry.dispose();
      (border.material as THREE.Material).dispose();
      sheenA.geometry.dispose();
      (sheenA.material as THREE.Material).dispose();
      sheenB.geometry.dispose();
      (sheenB.material as THREE.Material).dispose();
      sheenC.geometry.dispose();
      (sheenC.material as THREE.Material).dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden ${className || ""}`}
      style={{
        transform: "perspective(1000px) rotateX(var(--tx, 0deg)) rotateY(var(--ty, 0deg))",
        transition: "transform 90ms linear",
        willChange: "transform",
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} aria-hidden />
      <div className="relative" style={{ zIndex: 10 }}>
        {children}
      </div>
    </div>
  );
}