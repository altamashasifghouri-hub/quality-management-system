"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Navbar from "@/components/Navbar";

interface SopDoc {
  id: string;
  department: string;
  sop_number: string;
  title: string | null;
  file_name: string | null;
  file_url: string | null;
  content: string;
  created_at: string;
}

export default function InternalSops() {
  const supabase = createClient();
  const [sops, setSops] = useState<SopDoc[]>([]);
  const [knownDepts, setKnownDepts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ department: string; sop_number: string; title: string; content: string }>({ department: "", sop_number: "", title: "", content: "" });
  const [sopNumber, setSopNumber] = useState("");
  const [department, setDepartment] = useState("");
  const [title, setTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const [content, setContent] = useState("");
  const [chars, setChars] = useState(0);
  const [driveUrl, setDriveUrl] = useState("");
  const [savingToDrive, setSavingToDrive] = useState(false);
  const fileRef = useRef<File | null>(null);

  function showMsg(msg: string) { setMessage(msg); setTimeout(() => setMessage(""), 4000); }
  function showErr(msg: string) { setError(msg); setTimeout(() => setError(""), 5000); }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: sopData }, { data: deptData }] = await Promise.all([
      supabase.from("sop_documents").select("*").order("sop_number", { ascending: true }),
      supabase.from("departments").select("name"),
    ]);
    setSops((sopData || []).map((s: any) => ({
      id: s.id,
      department: s.department,
      sop_number: s.sop_number,
      title: s.title || null,
      file_name: s.file_name || null,
      file_url: s.file_url || null,
      content: s.content || "",
      created_at: s.created_at,
    })));
    const names = (deptData || []).map((d: any) => String(d.name || "").trim()).filter(Boolean);
    setKnownDepts(Array.from(new Set([...names, ...((sopData || []).map((s: any) => String(s.department || "").trim())).filter(Boolean)])));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleFile(file: File | null) {
    setExtracting(true);
    setError("");
    if (!file) { setExtracting(false); return; }
    if (file.size > 4 * 1024 * 1024) { setExtracting(false); return showErr("File must be 4MB or smaller."); }
    const ext = (file.name.toLowerCase().match(/\.[a-z0-9]+$/i) || [])[0] || "";
    if (![".txt", ".md", ".csv", ".docx", ".pdf"].includes(ext)) { setExtracting(false); return showErr("Supported formats: TXT, DOCX, PDF."); }
    fileRef.current = file;
    setFileName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/policy-extract", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { showErr(`${json?.error || "Could not read the file."}${json?.detail ? ` (${String(json.detail).slice(0, 160)})` : ""}`); return; }
      setContent(json.text || "");
      setChars(json.charCount || 0);
      setDriveUrl("");
      showMsg("SOP text extracted. You can also edit it below before saving.");
    } catch (e: any) {
      showErr(e?.message || "Could not read the file.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSaveToDrive() {
    if (!fileRef.current) return showErr("Upload the SOP file first.");
    setSavingToDrive(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", fileRef.current);
      fd.append("folderKind", "sop");
      const res = await fetch("/api/drive-upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return showErr(json?.error || "Upload to Google Drive failed.");
      setDriveUrl(json.url || "");
      showMsg("SOP document saved to Google Drive.");
    } catch (e: any) {
      showErr(e?.message || "Upload to Google Drive failed.");
    } finally {
      setSavingToDrive(false);
    }
  }

  async function handleSave() {
    if (!sopNumber.trim()) return showErr("Enter the SOP number.");
    if (!department.trim()) return showErr("Enter the department this SOP belongs to.");
    if (!content.trim() && !(fileRef.current && String(fileRef.current.type || "").includes("pdf"))) return showErr("Provide the SOP content (upload a PDF file or paste the text).");
    setSaving(true);
    setError("");
    const id = crypto.randomUUID();
    let fileUrl: string | null = null;
    if (fileRef.current) {
      try {
        const fd = new FormData();
        fd.append("file", fileRef.current);
        fd.append("folderKind", "sop");
        const dr = await fetch("/api/drive-upload", { method: "POST", body: fd });
        const djson = await dr.json().catch(() => ({}));
        if (dr.ok) {
          fileUrl = djson.url || null;
        } else {
          showErr(`Could not save the file to Google Drive: ${djson?.error || "Drive not connected"}. The SOP text is saved but the file was not uploaded.`);
        }
      } catch {
        showErr("Could not save the file to Google Drive. The SOP text is saved but the file was not uploaded.");
      }
    }
    const { error: err } = await supabase.from("sop_documents").insert({
      id,
      department: department.trim(),
      sop_number: sopNumber.trim(),
      title: title.trim() || null,
      file_name: fileName || null,
      file_url: fileUrl,
      content: content.trim(),
    });
    setSaving(false);
    if (err) return showErr(err.message);
    setShowForm(false);
    setSopNumber(""); setDepartment(""); setTitle(""); setFileName(""); setContent(""); setChars(0); setDriveUrl(""); fileRef.current = null;
    showMsg("SOP added — the AI extracted its text and findings are checked against it by department. The file is saved in Google Drive.");
    fetchData();
  }

  function toggleExpand(id: string) { setExpandedId((cur) => (cur === id ? null : id)); }

  function startEdit(s: SopDoc) {
    setEditId((cur) => (cur === s.id ? null : s.id));
    setEditForm({ department: s.department, sop_number: s.sop_number, title: s.title || "", content: s.content });
    setExpandedId(s.id);
  }

  async function saveEdit() {
    if (!editId) return;
    if (!editForm.sop_number.trim()) return showErr("Enter the SOP number.");
    if (!editForm.department.trim()) return showErr("Enter the department.");
    setSaving(true);
    setError("");
    const { error } = await supabase.from("sop_documents").update({
      department: editForm.department.trim(),
      sop_number: editForm.sop_number.trim(),
      title: editForm.title.trim() || null,
      content: editForm.content.trim(),
      updated_at: new Date().toISOString(),
    }).eq("id", editId);
    setSaving(false);
    if (error) return showErr(error.message);
    setEditId(null);
    showMsg("SOP updated.");
    fetchData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this SOP? It will no longer be used to check audit findings.")) return;
    const { error: err } = await supabase.from("sop_documents").delete().eq("id", id);
    if (err) return showErr(err.message);
    showMsg("SOP deleted.");
    fetchData();
  }

  const inputCls = "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 [color-scheme:dark] w-full";
  const labelCls = "block text-sm text-blue-200/60 mb-1";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-900/85 to-slate-950">
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/audit" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
            Back to Audit Management
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Internal SOPs</h1>
            <p className="text-blue-200/60">Upload each department SOP (PDF, DOCX or TXT). The AI reads the file, extracts the full text, and saves the original file to Google Drive. During audit records, when your notes relate to an SOP, the AI names the violated SOP number and clause.</p>
          </div>
          <button
            onClick={() => { setShowForm((v) => !v); setError(""); }}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors"
          >
            {showForm ? "Cancel" : "+ Add SOP"}
          </button>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>}

        {showForm && (
          <div className="bg-gradient-to-br from-teal-500/10 via-slate-800/30 to-slate-900/50 backdrop-blur-md border border-teal-500/30 rounded-2xl p-6 mb-8 space-y-5">
            <h2 className="text-xl font-bold text-white">Add a new SOP</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>SOP number *</label>
                <input value={sopNumber} onChange={(e) => setSopNumber(e.target.value)} placeholder="e.g. SOP-014" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Department *</label>
                <input value={department} onChange={(e) => setDepartment(e.target.value)} list="sop-depts" placeholder="e.g. Housekeeping" className={inputCls} />
                <datalist id="sop-depts">
                  {knownDepts.map((d) => <option key={d} value={d} />)}
                </datalist>
              </div>
              <div>
                <label className={labelCls}>Title (optional)</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Room Cleaning SOP" className={inputCls} />
              </div>
            </div>

            <div>
              <span className={`block text-sm text-blue-200/60 mb-1`}>SOP document (PDF, DOCX or TXT, up to 4MB)</span>
              {fileName ? (
                <div className="flex flex-wrap items-center gap-3 bg-teal-500/10 border border-teal-500/30 rounded-xl px-4 py-3">
                  <span className="text-sm text-teal-300 truncate flex-1 min-w-0">{extracting ? "Reading document..." : fileName}</span>
                  {extracting ? (
                    <span className="text-xs text-teal-300/70">Extracting text…</span>
                  ) : (
                    <>
                      <span className="text-xs text-teal-300/60">{chars.toLocaleString()} characters</span>
                      {!driveUrl && (
                        <button onClick={handleSaveToDrive} disabled={savingToDrive} className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium transition-colors disabled:opacity-50">
                          {savingToDrive ? "Saving..." : "Save to Google Drive"}
                        </button>
                      )}
                    </>
                  )}
                  <label className="text-xs text-white/70 underline cursor-pointer">
                    Replace
                    <input type="file" accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] || null)} />
                  </label>
                  {driveUrl && <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-300 underline">✓ In Google Drive</a>}
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 cursor-pointer border border-dashed border-teal-500/40 rounded-xl p-6 hover:bg-teal-500/5 transition-colors">
                  <input type="file" accept=".pdf,.docx,.txt,.md,.csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] || null)} />
                  <span className="text-sm text-teal-200/80">{extracting ? "Reading document..." : "Click to upload the SOP file"}</span>
                  <span className="text-xs text-blue-200/40">PDF · DOCX · TXT — or paste the SOP text below</span>
                </label>
              )}
            </div>

            <div>
              <label className={labelCls}>SOP content (extracted from the file or paste manually) *</label>
              <textarea
                value={content}
                onChange={(e) => { setContent(e.target.value); setChars(e.target.value.length); }}
                rows={10}
                placeholder="The text of the SOP. Upload the file above to fill this automatically."
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
              />
              <p className="text-xs text-blue-200/40 mt-1">{chars.toLocaleString()} characters</p>
            </div>

            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                {saving ? "Saving..." : "Save SOP"}
              </button>
              <button onClick={() => { setShowForm(false); setError(""); }} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" /></div>
        ) : sops.length === 0 ? (
          <p className="text-blue-200/40 text-center py-16">No SOPs yet. Add one to start checking audit notes against your procedures.</p>
        ) : (
          <div className="space-y-3">
            {sops.map((s) => {
              const open = expandedId === s.id;
              const editing = editId === s.id;
              return (
                <div key={s.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl overflow-hidden">
                  <button onClick={() => toggleExpand(s.id)} className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/5 transition-colors">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-0.5 text-xs rounded-full bg-teal-500/20 border border-teal-500/40 text-teal-300">{s.sop_number}</span>
                        <span className="px-2.5 py-0.5 text-xs rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-200">{s.department}</span>
                        {s.title && <span className="text-white font-medium truncate">{s.title}</span>}
                      </div>
                      <p className="text-xs text-blue-200/40 mt-2">
                        {s.file_name || "Pasted text"} · {s.content.length.toLocaleString()} characters · added {new Date(s.created_at).toLocaleDateString()}
                        {s.file_url && (
                          <a href={s.file_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-teal-300 underline" onClick={(e) => e.stopPropagation()}>· in Google Drive</a>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => startEdit(s)} className="px-3 py-1.5 text-xs rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white">Edit</button>
                      <button onClick={() => handleDelete(s.id)} className="px-3 py-1.5 text-xs rounded-lg bg-red-600/80 hover:bg-red-600 text-white">Delete</button>
                      <svg className={`w-5 h-5 text-blue-200/60 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {open && (
                    <div className="px-5 pb-5">
                      {editing ? (
                        <div className="space-y-3 pt-4 border-t border-white/10">
                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-blue-200/60 mb-1">Department</label>
                              <input
                                value={editForm.department}
                                onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}
                                list="sop-depts"
                                placeholder="e.g. Warehouse & Distribution"
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-blue-200/60 mb-1">SOP number</label>
                              <input
                                value={editForm.sop_number}
                                onChange={(e) => setEditForm((f) => ({ ...f, sop_number: e.target.value }))}
                                placeholder="e.g. SOP-HR-003"
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-blue-200/60 mb-1">Title</label>
                            <input
                              value={editForm.title}
                              onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                              placeholder="e.g. Onboarding and Offboarding Procedure"
                              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-blue-200/60 mb-1">Full text</label>
                            <textarea
                              value={editForm.content}
                              onChange={(e) => setEditForm((f) => ({ ...f, content: e.target.value }))}
                              rows={10}
                              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={saveEdit} disabled={saving} className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                              {saving ? "Saving..." : "Save changes"}
                            </button>
                            <button onClick={() => setEditId(null)} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-4 border-t border-white/10">
                          <p className="text-xs text-blue-200/60 mb-2">SOP content</p>
                          <div className="max-h-72 overflow-y-auto bg-black/20 border border-white/10 rounded-xl p-4 text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                            {s.content}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}