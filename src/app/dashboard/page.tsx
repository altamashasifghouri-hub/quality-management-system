import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import QmsBrand from "@/components/QmsBrand";

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/signin");
  }

  const displayName = user.user_metadata?.full_name || user.email || "there";

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/auth/signin");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <nav className="border-b border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <QmsBrand compact />
            <span className="text-white font-semibold">QMS</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-blue-200/60">{user.email}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="px-4 py-2 text-sm text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all duration-200"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-16 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-blue-600/20 border border-blue-500/30 mb-6">
          <svg
            className="w-10 h-10 text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
            />
          </svg>
        </div>
        <h1 className="text-4xl font-bold text-white mb-2">
          Welcome, {displayName}!
        </h1>
        <p className="text-lg text-blue-200/70 mb-12">
          You are now signed in to the Quality Management System.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: "Audit Management",
              desc: "Plan and execute quality audits",
              icon: "M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6"
            >
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-lg bg-blue-600/20 border border-blue-500/30 mb-4">
                <svg
                  className="w-5 h-5 text-blue-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={item.icon}
                  />
                </svg>
              </div>
              <h3 className="text-white font-semibold mb-1">{item.title}</h3>
              <p className="text-sm text-blue-200/50">{item.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
