"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { jsPDF } from "jspdf";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";
import { deleteDriveFileByUrl } from "@/lib/drive-file";
import { driveErrorMessage } from "@/lib/drive-error";
import { loadPdfImage, preloadPdfImages } from "@/lib/pdf-image";

const LOGO = "/logo.jpg";
const SIG_DEFAULT = "/signature.png";

type Block =
  | { k: "h"; t: string }
  | { k: "p"; t: string }
  | { k: "b"; t: string }
  | { k: "li"; t: string }
  | { k: "hr" };

const INTRO: Block[] = [
  { k: "p", t: "I am an Internal Auditor." },
  { k: "p", t: "I hold myself to the highest standards of professional conduct." },
  { k: "p", t: "This Code is my personal commitment." },
];

const BODY: Block[] = [
  { k: "h", t: "1. Integrity" },
  { k: "p", t: "I will always act with honesty, truthfulness, and professional courage." },
  { k: "p", t: "I will report facts accurately and completely, even when the findings are uncomfortable or unpopular." },
  { k: "p", t: "I will never knowingly participate in, conceal, or ignore illegal, unethical, or discreditable acts." },
  { k: "p", t: "I will uphold the legitimate and ethical objectives of the organization I serve." },

  { k: "h", t: "2. Objectivity" },
  { k: "p", t: "I will maintain an impartial and unbiased mindset in every engagement." },
  { k: "p", t: "I will not allow personal interests, relationships, gifts, pressure, or external influence to affect my judgment." },
  { k: "p", t: "I will promptly disclose any actual or perceived impairment to my objectivity." },
  { k: "p", t: "I will base my conclusions only on sufficient, reliable, and relevant evidence." },
  { k: "b", t: "In particular:" },
  { k: "li", t: "I will not accept any food items, drinks, gifts, hospitality, or favors that may impair (or appear to impair) my objectivity." },
  { k: "li", t: "I will keep all professional interactions free from personal discussions and casual or joking behavior that could reduce seriousness or create an unprofessional atmosphere." },

  { k: "h", t: "3. Competency" },
  { k: "p", t: "I will only accept work for which I have (or can reasonably obtain) the necessary knowledge, skills, and experience." },
  { k: "p", t: "I will continuously develop my professional capabilities through learning and training." },
  { k: "p", t: "I will apply the Global Internal Audit Standards and other applicable professional requirements in my work." },

  { k: "h", t: "4. Due Professional Care" },
  { k: "p", t: "I will plan and perform every engagement with diligence, sound judgment, and professional skepticism." },
  { k: "p", t: "I will exercise the care expected of a prudent and competent internal auditor." },
  { k: "p", t: "I will not allow carelessness, haste, or complacency to compromise the quality of my work." },

  { k: "h", t: "5. Confidentiality" },
  { k: "p", t: "I will protect all information obtained in the course of my duties." },
  { k: "p", t: "I will not use confidential information for personal gain or in any way that harms the organization." },
  { k: "p", t: "I will disclose information only when authorized or when required by law or professional obligation." },

  { k: "h", t: "6. Professional Conduct" },
  { k: "p", t: "I will maintain a strictly professional demeanor at all times while performing my duties." },
  { k: "p", t: "I will avoid jokes, casual banter, personal discussions, and any informal behavior that may undermine the seriousness and independence of the internal audit role." },
  { k: "p", t: "I will treat every interaction with dignity, respect, and focus on the work at hand." },
  { k: "p", t: "I will not respond to greetings or pleasantries such as 'Hi', 'Hello', or 'Assalam o Alaikum'. Every interaction will be kept strictly to professional matters, and I will not enter into casual exchange of any kind while performing my duties." },

  { k: "hr" },
  { k: "b", t: "I accept full personal responsibility for living by this Code." },
  { k: "b", t: "My reputation, the trust placed in me, and the credibility of the internal audit profession depend on it." },
];

interface EthicsRecord {
  id: number;
  auditor_name: string | null;
  signature: string | null;
  pdf_url: string | null;
  pdf_public_id: string | null;
  signed_at: string | null;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export default function CodeOfEthicsPage() {
  const supabase = createClient();
  const [rec, setRec] = useState<EthicsRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayISO());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const fetchData = useCallback(async () => {
    const { data } = await supabase.from("code_of_ethics").select("*").eq("id", 1).maybeSingle();
    const r = (data || null) as EthicsRecord | null;
    setRec(r);
    setName(r?.auditor_name || "");
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function showMsg(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(""), 4000);
  }
  function showErr(msg: string) {
    setError(msg);
    setTimeout(() => setError(""), 5000);
  }

  async function handleSignatureUpload(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return showErr("Signature must be an image file.");
    if (file.size > 2 * 1024 * 1024) return showErr("Signature image must be under 2MB.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read the file."));
      reader.readAsDataURL(file);
    }).catch(() => "");
    if (!dataUrl) return showErr("Could not read the signature image.");
    const { error: err } = await supabase
      .from("code_of_ethics")
      .update({ signature: dataUrl, auditor_name: name.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (err) return showErr(err.message);
    showMsg("Signature saved.");
    fetchData();
  }

  async function buildDoc(): Promise<{ doc: jsPDF; filename: string } | null> {
    const sigUrl = rec?.signature || SIG_DEFAULT;
    await preloadPdfImages([LOGO, sigUrl]);

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 22;
      const maxWidth = pageWidth - margin * 2;
      const maxY = pageHeight - 14;
      let y = margin;
      const blue: [number, number, number] = [29, 78, 216];

      const ensure = (need: number) => {
        if (y + need > maxY) {
          doc.addPage();
          y = margin;
        }
      };

      try {
        const logoUrl = await loadPdfImage(LOGO);
        doc.addImage(logoUrl, "JPEG", (pageWidth - 46) / 2, y, 46, 33);
      } catch {
        /* logo unavailable */
      }

      y += 46;
      doc.setFontSize(15);
      doc.setTextColor(15, 23, 42);
      doc.text("Code of Ethics", pageWidth / 2, y, { align: "center" });
      y += 7;
      doc.setFontSize(11);
      doc.setTextColor(71, 85, 105);
      doc.text("Internal Auditor", pageWidth / 2, y, { align: "center" });
      y += 14;

      const draw = (b: Block) => {
        if (b.k === "hr") {
          ensure(10);
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.3);
          doc.line(margin, y, pageWidth - margin, y);
          y += 10;
          return;
        }
        if (b.k === "h") {
          ensure(14);
          y += 3;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(12);
          doc.setTextColor(blue[0], blue[1], blue[2]);
          const lines = doc.splitTextToSize(b.t, maxWidth);
          lines.forEach((ln: string) => {
            ensure(6);
            doc.text(ln, margin, y);
            y += 6;
          });
          y += 3;
          return;
        }
        const bold = b.k === "b";
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(10);
        doc.setTextColor(bold ? 15 : 30, bold ? 23 : 41, bold ? 42 : 59);
        const indent = b.k === "li" ? 6 : 0;
        const text = b.k === "li" ? `\u2022  ${b.t}` : b.t;
        const lines = doc.splitTextToSize(text, maxWidth - indent);
        lines.forEach((ln: string) => {
          ensure(5);
          doc.text(ln, margin + indent, y);
          y += 5;
        });
        y += bold ? 3 : 3.5;
      };

      INTRO.forEach(draw);
      y += 4;
      BODY.forEach(draw);

      y += 6;
      ensure(58);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text("Signature:", margin, y);
      doc.text("Date:", margin, y + 20);

      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.3);
      doc.line(margin + 30, y + 4, margin + 145, y + 4);
      doc.line(margin + 30, y + 24, margin + 145, y + 24);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text(fmtDate(date), margin + 34, y + 22);

      try {
        const sigData = await loadPdfImage(sigUrl);
        doc.addImage(sigData, "JPEG", margin + 34, y - 15, 54, 18);
      } catch {
        /* signature image unavailable */
      }

      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("Internal Auditor", margin + 30, y + 9);
      y += 34;

      if (name.trim()) {
        doc.setFontSize(9.5);
        doc.setTextColor(30, 41, 59);
        doc.text(`Signed by: ${name.trim()}`, margin, y);
        y += 6;
      }

      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text("Generated from the Quality Management System — Audit Management module.", margin, y);

      const filename = `Code_of_Ethics_Internal_Auditor_${fmtDate(date).replace(/\//g, "-")}.pdf`;
      return { doc, filename };
    } catch {
      return null;
    }
  }

  async function handleDownload() {
    setBusy(true);
    setError("");
    try {
      const built = await buildDoc();
      if (!built) return showErr("Could not generate the PDF.");
      built.doc.save(built.filename);
      showMsg("Code of Ethics downloaded.");

      setSaving(true);
      try {
        const blob = built.doc.output("blob");
        const formData = new FormData();
        formData.append("file", blob, built.filename);
        formData.append("folderKind", "report");
        const res = await fetch("/api/drive-upload", { method: "POST", body: formData });
        if (res.ok) {
          const json = await res.json();
          if (json.url) {
            if (rec?.pdf_public_id) await deleteDriveFileByUrl(rec.pdf_public_id);
            const { error: updErr } = await supabase
              .from("code_of_ethics")
              .update({
                pdf_url: json.url,
                pdf_public_id: json.fileId || null,
                signed_at: date,
                auditor_name: name.trim() || null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", 1);
            if (!updErr) {
              showMsg("Downloaded and saved to Google Drive.");
              fetchData();
            }
          }
        } else {
          const errJson = await res.json().catch(() => ({}));
          showErr(driveErrorMessage(errJson, "Downloaded, but saving to Google Drive failed."));
        }
      } catch {
        showErr("Downloaded, but saving to Google Drive failed.");
      } finally {
        setSaving(false);
      }
    } catch {
      showErr("Could not generate the PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function handleViewSaved() {
    if (!rec?.pdf_url) return;
    window.open(rec.pdf_url, "_blank", "noopener");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="mb-8">
          <Link href="/audit" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back to Audit Management
          </Link>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Code of Ethics</h1>
            <p className="text-blue-200/60">Download the signed Code of Ethics for any date. One copy is stored in Google Drive and replaced on every download.</p>
          </div>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-5">
            <div className="bg-gradient-to-br from-blue-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-blue-400/20 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Sign &amp; Download</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-blue-200/70 mb-1">Date on the document</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-blue-200/70 mb-1">Signed by (optional)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-blue-200/70 mb-2">Signature</label>
                  <div className="bg-white px-3 py-2 rounded-lg border border-white/10 min-h-[60px] flex items-center justify-center">
                    <img src={rec?.signature || SIG_DEFAULT} alt="Signature" className="h-12 object-contain" />
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <label className="px-3 py-2 text-xs rounded-lg bg-blue-600/30 border border-blue-500/40 text-blue-200 hover:bg-blue-600/50 transition-colors cursor-pointer">
                      {rec?.signature ? "Replace signature" : "Upload signature"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          handleSignatureUpload(e.target.files?.[0] || null);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {rec?.signature && (
                      <button
                        onClick={async () => {
                          await supabase.from("code_of_ethics").update({ signature: null }).eq("id", 1);
                          showMsg("Reset to default signature.");
                          fetchData();
                        }}
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Reset to default
                      </button>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleDownload}
                  disabled={busy || loading}
                  className="w-full px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition-colors shadow-lg shadow-blue-600/25"
                >
                  {busy ? (saving ? "Saving to Google Drive..." : "Generating...") : "Download Signed Code of Ethics"}
                </button>

                {rec?.pdf_url && (
                  <button
                    onClick={handleViewSaved}
                    className="w-full px-4 py-2.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white text-sm rounded-lg transition-colors"
                  >
                    Open copy in Google Drive
                  </button>
                )}

                {rec?.signed_at && (
                  <p className="text-xs text-blue-200/40 pt-1">
                    Drive copy last signed {fmtDate(rec.signed_at)}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
              <p className="text-sm font-semibold text-slate-700">Preview — document generated with the date above</p>
            </div>
            <div className="p-6 sm:p-9 max-h-[70vh] overflow-y-auto">
              <p className="text-xs text-slate-400 uppercase tracking-widest text-center mb-1">Quality Management System</p>
              <h2 className="text-xl font-bold text-slate-900 text-center">Code of Ethics</h2>
              <p className="text-sm font-medium text-slate-600 text-center mb-6">Internal Auditor</p>

              {INTRO.map((b, i) => (
                <p key={i} className="text-sm text-slate-800 leading-relaxed mb-1">
                  {b.k === "p" ? b.t : ""}
                </p>
              ))}

              <div className="mt-4 space-y-3">
                {BODY.map((b, i) => {
                  if (b.k === "hr") return <hr key={i} className="border-slate-300 my-5" />;
                  if (b.k === "h")
                    return (
                      <h3 key={i} className="text-base font-bold text-blue-700 pt-2">
                        {b.t}
                      </h3>
                    );
                  if (b.k === "li")
                    return (
                      <p key={i} className="text-sm text-slate-800 leading-relaxed pl-5 -indent-4">
                        &bull;&nbsp;&nbsp;{b.t}
                      </p>
                    );
                  return (
                    <p key={i} className={`text-sm leading-relaxed ${b.k === "b" ? "font-semibold text-slate-900" : "text-slate-800"}`}>
                      {b.t}
                    </p>
                  );
                })}
              </div>

              <div className="mt-8 pt-6 border-t border-slate-300">
                <div className="flex items-end gap-10">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 mb-1">Signature:</p>
                    <div className="h-14 flex items-end justify-center w-52">
                      <img src={rec?.signature || SIG_DEFAULT} alt="Signature" className="h-14 object-contain" />
                    </div>
                    <div className="border-t border-slate-700 w-52" />
                    <p className="text-xs text-slate-500 mt-1">Internal Auditor</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 mb-1">Date:</p>
                    <div className="h-14 flex items-center w-52">
                      <span className="text-sm text-slate-800">{fmtDate(date)}</span>
                    </div>
                    <div className="border-t border-slate-700 w-52" />
                    <p className="text-xs text-slate-500 mt-1">&nbsp;</p>
                  </div>
                </div>
                {name.trim() && <p className="text-sm text-slate-800 mt-4">Signed by: {name.trim()}</p>}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
