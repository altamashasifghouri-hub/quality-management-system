"use client";

import { useRef, useState } from "react";

export default function ThreedCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden rounded-xl transition-all duration-200 ease-out ${
        hover ? "z-20" : "z-0"
      } ${className || ""}`}
      style={{
        transform: `perspective(900px) rotateX(var(--tx, 0deg)) rotateY(var(--ty, 0deg)) scale(${hover ? 1.03 : 1})`,
        willChange: "transform",
        boxShadow: hover
          ? "0 24px 50px -18px rgba(0,0,0,0.65), 0 0 0 1px rgba(147,197,253,0.18)"
          : "0 12px 40px -20px rgba(0,0,0,0.7)",
        transition: "transform 220ms ease, box-shadow 220ms ease",
      }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => {
        setHover(false);
        const w = wrapRef.current;
        if (w) {
          w.style.setProperty("--tx", "0deg");
          w.style.setProperty("--ty", "0deg");
        }
      }}
      onPointerMove={(e) => {
        const w = wrapRef.current;
        if (!w) return;
        const r = w.getBoundingClientRect();
        const hx = ((e.clientX - r.left) / r.width) * 2 - 1;
        const hy = -(((e.clientY - r.top) / r.height) * 2 - 1);
        w.style.setProperty("--tx", `${(hx * 6).toFixed(2)}deg`);
        w.style.setProperty("--ty", `${(-hy * 6).toFixed(2)}deg`);
      }}
    >
      {children}
    </div>
  );
}