import Link from "next/link";
import QmsBrand from "@/components/QmsBrand";

export default function PublicView() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <nav className="border-b border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <QmsBrand compact />
            <span className="text-white font-semibold">Quality Management System</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/auth/signin"
              className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all duration-200"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-white mb-3">
            Quality Management System
          </h1>
          <p className="text-lg text-blue-200/70 max-w-2xl mx-auto">
            A public overview of our quality management approach, processes, and
            commitment to continuous improvement.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {[
            {
              title: "Document Control",
              desc: "Manage quality documents, policies, and revisions with strict version control and approval workflows.",
              icon: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
            },
            {
              title: "Non-Conformance",
              desc: "Track, investigate, and resolve quality issues to prevent recurrence and drive corrective actions.",
              icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z",
            },
            {
              title: "Audit Management",
              desc: "Plan and execute internal and external quality audits with comprehensive reporting.",
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
              <h3 className="text-white font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-blue-200/60">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-3">
            Our Commitment to Quality
          </h2>
          <p className="text-blue-200/70">
            We are committed to delivering products and services that meet or
            exceed customer expectations through well-defined processes,
            continuous improvement, and a culture of quality across the
            organization.
          </p>
        </div>
      </main>
    </div>
  );
}
