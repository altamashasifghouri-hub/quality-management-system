"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function Settings() {
  const router = useRouter();
  const supabase = createClient();

  const [sessionUser, setSessionUser] = useState<{
    email?: string;
    full_name?: string;
  } | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (u) {
        setSessionUser({
          email: u.email,
          full_name: (u.user_metadata?.full_name as string) ?? "",
        });
        setName((u.user_metadata?.full_name as string) ?? "");
        setEmail(u.email ?? "");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const { error } = await supabase.auth.updateUser({
      data: { full_name: name },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setMessage("Name saved.");
    setSaved(true);
    setLoading(false);
    setTimeout(() => setSaved(false), 4000);
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const { error } = await supabase.auth.updateUser({ email });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setMessage("Check your email to confirm the email change.");
    setLoading(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setMessage("Password updated.");
    setNewPassword("");
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Link href="/dashboard" className="inline-flex items-center gap-3 mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30">
              <svg
                className="w-6 h-6 text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                />
              </svg>
            </div>
          </Link>
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="text-blue-200/60 mt-2">
            Manage your name, email, and password
          </p>
        </div>

        {!sessionUser && (
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
            <div className="flex justify-center mb-4">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-blue-200/60">Loading your settings...</p>
          </div>
        )}

        {sessionUser && (
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-lg font-semibold text-white mb-4">
                Profile Name
              </h2>
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save Name"}
                </button>
              </form>
            </div>

            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-lg font-semibold text-white mb-4">
                Change Email
              </h2>
              <form onSubmit={handleChangeEmail} className="space-y-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="New email address"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-50"
                >
                  {loading ? "Updating..." : "Update Email"}
                </button>
              </form>
            </div>

            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-lg font-semibold text-white mb-4">
                Change Password
              </h2>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  minLength={6}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-50"
                >
                  {loading ? "Updating..." : "Update Password"}
                </button>
              </form>
            </div>

            {message && (
              <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 text-center">
                {message}
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 text-center">
                {error}
              </div>
            )}

            {saved && (
              <div className="text-center">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg border border-white/20 transition-all duration-200"
                >
                  Go to Dashboard
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/dashboard"
            className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}