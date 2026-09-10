"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

function makeStars(count: number, size: number, radiusMin: number, radiusMax: number, palette: string[]) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const cols = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = radiusMin + Math.random() * (radiusMax - radiusMin);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
    c.set(palette[(Math.random() * palette.length) | 0]);
    const j = 0.4 + Math.random() * 0.6;
    cols[i * 3] = c.r * j;
    cols[i * 3 + 1] = c.g * j;
    cols[i * 3 + 2] = c.b * j;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  const mat = new THREE.PointsMaterial({
    size,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  return {
    points: new THREE.Points(geo, mat),
    geo,
    mat,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

export default function ThreeBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x04070f, 0.002);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    camera.position.set(0, 0, 9);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.position = "fixed";
    canvas.style.inset = "0";
    canvas.style.zIndex = "-1";
    container.appendChild(canvas);

    const lens = new THREE.AmbientLight(0x93b4ff, 0.55);
    const sun = new THREE.DirectionalLight(0xa8c6ff, 1.4);
    sun.position.set(6, 4, 8);
    scene.add(lens, sun);

    const starPalette = ["#ffffff", "#bfd7ff", "#ffd9a8", "#e6f0ff"];
    const stars = makeStars(1200, 0.035, 12, 42, starPalette);
    const starsMid = makeStars(350, 0.06, 10, 30, starPalette);
    const starsBig = makeStars(60, 0.1, 14, 34, ["#ffffff", "#ffedc7"]);
    scene.add(stars.points, starsMid.points, starsBig.points);

    const disposeList: { dispose: () => void }[] = [stars, starsMid, starsBig];

    let width = 0;
    let height = 0;
    const mouse = { x: 0, y: 0 };

    function onResize() {
      width = window.innerWidth;
      height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }

    function onPointer(e: PointerEvent) {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
    }

    onResize();
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer);

    let raf = 0;
    const clock = new THREE.Clock();
    function tick() {
      const t = clock.getElapsedTime();
      stars.points.rotation.y = t * 0.004;
      stars.points.rotation.x = Math.sin(t * 0.02) * 0.01;
      starsMid.points.rotation.y = -t * 0.006;
      starsBig.points.rotation.y = t * 0.003 + Math.sin(t * 0.4) * 0.02;

      camera.position.x += (mouse.x * 1.4 - camera.position.x) * 0.03;
      camera.position.y += (-mouse.y * 1.0 - camera.position.y) * 0.03;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      disposeList.forEach((d) => d.dispose());
      scene.traverse((obj) => {
        if (obj instanceof THREE.Sprite) obj.material.dispose();
      });
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={containerRef} aria-hidden="true" className="pointer-events-none fixed inset-0" />;
}