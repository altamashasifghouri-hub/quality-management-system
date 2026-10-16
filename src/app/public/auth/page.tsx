"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function PinForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/public";
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/settings/public-pin/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }), credentials: "same-origin" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Invalid PIN");
      const dest = next.startsWith("/") ? next : "/public";
      window.location.assign(dest);
    } catch (e: any) {
      setError(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950 flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-gradient-to-br from-blue-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-blue-400/20 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-xl font-bold text-white mb-2">Enter Public Access PIN</h1>
        <p className="text-xs text-blue-200/60 mb-6">This portal is PIN-protected</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4,6}"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="4-6 digit PIN"
            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {error && <p className="text-red-300 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function PublicPinAuth() {
  return (
    <Suspense fallback={null}>
      <PinForm />
    </Suspense>
  );
}
