import Link from "next/link";

export default function QmsBrand({ compact = false }: { compact?: boolean }) {
  const box = compact ? "w-9 h-9 rounded-lg" : "w-12 h-12 rounded-xl";
  const icon = compact ? "w-5 h-5" : "w-6 h-6";
  return (
    <span className="inline-flex items-center justify-center bg-blue-600/20 border border-blue-500/30">
      <svg
        className={`${icon} text-blue-400`}
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
        />
      </svg>
    </span>
  );
}
