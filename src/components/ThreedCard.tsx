"use client";

import { useRef, useState } from "react";

export default function ThreedCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div
      className={`relative overflow-hidden rounded-xl transition-all duration-200 ease-out ${
        hover ? "z-20" : "z-0"
      } ${className || ""}`}
      style={{
        transform: `scale(${hover ? 1.03 : 1})`,
        willChange: "transform",
        boxShadow: hover
          ? "0 24px 50px -18px rgba(0,0,0,0.65), 0 0 0 1px rgba(147,197,253,0.18)"
          : "0 12px 40px -20px rgba(0,0,0,0.7)",
        transition: "transform 220ms ease, box-shadow 220ms ease",
      }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      {children}
    </div>
  );
}