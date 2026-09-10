"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function ThreeBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a1530, 0.0035);

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 9);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    const canvas = renderer.domElement;
    canvas.style.position = "fixed";
    canvas.style.inset = "0";
    canvas.style.zIndex = "-1";
    container.appendChild(canvas);

    const particles = new THREE.BufferGeometry();
    const count = 1600;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const amber = new THREE.Color("#f59e0b");
    const blue = new THREE.Color("#3b82f6");
    const lightBlue = new THREE.Color("#60a5fa");
    const palette = [blue, amber, lightBlue, blue];
    for (let i = 0; i < count; i++) {
      const r = 6 + Math.random() * 14;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi) - 4;
      const c = palette[i % palette.length];
      const jitter = 0.5 + Math.random() * 0.5;
      colors[i * 3] = c.r * jitter;
      colors[i * 3 + 1] = c.g * jitter;
      colors[i * 3 + 2] = c.b * jitter;
    }
    particles.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particles.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pointCloud = new THREE.Points(particles, material);
    scene.add(pointCloud);

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.9, 2),
      new THREE.MeshBasicMaterial({
        color: "#f59e0b",
        wireframe: true,
        transparent: true,
        opacity: 0.06,
      })
    );
    core.position.set(2.6, -0.8, -4);
    scene.add(core);

    const core2 = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.3, 1),
      new THREE.MeshBasicMaterial({
        color: "#3b82f6",
        wireframe: true,
        transparent: true,
        opacity: 0.08,
      })
    );
    core2.position.set(-3, 1.4, -5);
    scene.add(core2);

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
      pointCloud.rotation.y = t * 0.035;
      pointCloud.rotation.x = Math.sin(t * 0.05) * 0.06;
      core.rotation.x = t * 0.12;
      core.rotation.y = t * 0.16;
      core2.rotation.x = -t * 0.1;
      core2.rotation.y = t * 0.13;
      camera.position.x += (mouse.x * 1.6 - camera.position.x) * 0.03;
      camera.position.y += (-mouse.y * 1.1 - camera.position.y) * 0.03;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      particles.dispose();
      material.dispose();
      core.geometry.dispose();
      (core.material as THREE.Material).dispose();
      core2.geometry.dispose();
      (core2.material as THREE.Material).dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return <div ref={containerRef} aria-hidden="true" className="pointer-events-none fixed inset-0" />;
}