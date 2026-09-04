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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <div className="border-b border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="text-white font-semibold">QMS</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white font-medium">Admin</span>
          </div>
        </div>
      </div>

      <main className="max-w-lg mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-white mb-2">User Settings</h1>
        <p className="text-blue-200/60 mb-8">Manage your name, email, and password</p>

        {!sessionUser && (
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-blue-200/60">Loading your settings...</p>
          </div>
        )}

        {sessionUser && (
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 shadow-2xl">
              <h2 className="text-lg font-semibold text-white mb-4">Profile Name</h2>
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
              <h2 className="text-lg font-semibold text-white mb-4">Change Email</h2>
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
              <h2 className="text-lg font-semibold text-white mb-4">Change Password</h2>
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
          <Link href="/dashboard" className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors">
            ← Back to Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
