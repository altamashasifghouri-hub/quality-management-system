"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Branch {
  id: string;
  name: string;
  created_at: string;
  departments: Department[];
}

interface Department {
  id: string;
  name: string;
  branch_id: string;
}

export default function BranchesPage() {
  const supabase = createClient();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  const [newBranchName, setNewBranchName] = useState("");
  const [editBranchId, setEditBranchId] = useState<string | null>(null);
  const [editBranchName, setEditBranchName] = useState("");

  const [expandedBranch, setExpandedBranch] = useState<string | null>(null);
  const [newDeptName, setNewDeptName] = useState("");
  const [editDeptId, setEditDeptId] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState("");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    const { data: branchData } = await supabase
      .from("branches")
      .select("*")
      .order("created_at", { ascending: true });

    const { data: deptData } = await supabase
      .from("departments")
      .select("*")
      .order("created_at", { ascending: true });

    const deptMap = new Map<string, Department[]>();
    (deptData || []).forEach((d) => {
      const list = deptMap.get(d.branch_id) || [];
      list.push(d);
      deptMap.set(d.branch_id, list);
    });

    setBranches(
      (branchData || []).map((b) => ({
        ...b,
        departments: deptMap.get(b.id) || [],
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  function showMsg(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  }

  function showErr(msg: string) {
    setError(msg);
    setTimeout(() => setError(""), 4000);
  }

  async function handleAddBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    const { error } = await supabase
      .from("branches")
      .insert({ name: newBranchName.trim() });
    if (error) return showErr(error.message);
    setNewBranchName("");
    showMsg("Branch added.");
    fetchBranches();
  }

  async function handleUpdateBranch(id: string) {
    if (!editBranchName.trim()) return;
    const { error } = await supabase
      .from("branches")
      .update({ name: editBranchName.trim(), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return showErr(error.message);
    setEditBranchId(null);
    setEditBranchName("");
    showMsg("Branch updated.");
    fetchBranches();
  }

  async function handleDeleteBranch(id: string) {
    const { error } = await supabase.from("branches").delete().eq("id", id);
    if (error) return showErr(error.message);
    showMsg("Branch deleted.");
    fetchBranches();
  }

  async function handleAddDept(e: React.FormEvent, branchId: string) {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    const { error } = await supabase
      .from("departments")
      .insert({ name: newDeptName.trim(), branch_id: branchId });
    if (error) return showErr(error.message);
    setNewDeptName("");
    showMsg("Department added.");
    fetchBranches();
  }

  async function handleUpdateDept(id: string) {
    if (!editDeptName.trim()) return;
    const { error } = await supabase
      .from("departments")
      .update({ name: editDeptName.trim(), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return showErr(error.message);
    setEditDeptId(null);
    setEditDeptName("");
    showMsg("Department updated.");
    fetchBranches();
  }

  async function handleDeleteDept(id: string) {
    const { error } = await supabase.from("departments").delete().eq("id", id);
    if (error) return showErr(error.message);
    showMsg("Department deleted.");
    fetchBranches();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <nav className="border-b border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
            <span className="text-white font-semibold">QMS</span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white font-medium">Admin</span>
            <Link href="/settings" className="px-4 py-2 text-sm text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all duration-200">
              Settings
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back to Dashboard
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">Branches</h1>
        <p className="text-blue-200/60 mb-8">Manage branches and their departments</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm rounded-lg px-4 py-3 mb-6">{error}</div>
        )}
        {message && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-300 text-sm rounded-lg px-4 py-3 mb-6">{message}</div>
        )}

        <form onSubmit={handleAddBranch} className="flex gap-3 mb-8">
          <input
            type="text"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            placeholder="New branch name"
            required
            className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200"
          />
          <button type="submit" className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-all duration-200 shadow-lg shadow-blue-600/25">
            Add Branch
          </button>
        </form>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : branches.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center">
            <p className="text-blue-200/60">No branches yet. Add your first branch above.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {branches.map((branch) => (
              <div key={branch.id} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4">
                  <div className="flex items-center gap-3 flex-1">
                    <button
                      onClick={() => setExpandedBranch(expandedBranch === branch.id ? null : branch.id)}
                      className="text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      <svg className={`w-5 h-5 transition-transform duration-200 ${expandedBranch === branch.id ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                    {editBranchId === branch.id ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={editBranchName}
                          onChange={(e) => setEditBranchName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleUpdateBranch(branch.id)}
                          autoFocus
                          className="flex-1 px-3 py-2 bg-white/10 border border-blue-500 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button onClick={() => handleUpdateBranch(branch.id)} className="px-3 py-2 bg-green-600 hover:bg-green-500 text-white text-sm rounded-lg transition-colors">Save</button>
                        <button onClick={() => { setEditBranchId(null); setEditBranchName(""); }} className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex-1">
                        <h3 className="text-white font-semibold">{branch.name}</h3>
                        <p className="text-xs text-blue-200/40">{branch.departments.length} department{branch.departments.length !== 1 ? "s" : ""}</p>
                      </div>
                    )}
                  </div>
                  {editBranchId !== branch.id && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setEditBranchId(branch.id); setEditBranchName(branch.name); }}
                        className="px-3 py-2 text-xs text-blue-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all duration-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { if (confirm(`Delete branch "${branch.name}"?`)) handleDeleteBranch(branch.id); }}
                        className="px-3 py-2 text-xs text-red-400 hover:text-red-300 bg-white/5 hover:bg-red-500/10 rounded-lg transition-all duration-200"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {expandedBranch === branch.id && (
                  <div className="border-t border-white/10 px-6 py-4 bg-white/[0.02]">
                    <h4 className="text-sm font-medium text-blue-200/70 mb-3">Departments</h4>

                    <form onSubmit={(e) => handleAddDept(e, branch.id)} className="flex gap-2 mb-3">
                      <input
                        type="text"
                        value={newDeptName}
                        onChange={(e) => setNewDeptName(e.target.value)}
                        placeholder="New department name"
                        required
                        className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-all duration-200">
                        Add
                      </button>
                    </form>

                    {branch.departments.length === 0 ? (
                      <p className="text-sm text-blue-200/40 py-2">No departments yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {branch.departments.map((dept) => (
                          <div key={dept.id} className="flex items-center justify-between px-4 py-2.5 bg-white/5 rounded-lg">
                            {editDeptId === dept.id ? (
                              <div className="flex items-center gap-2 flex-1">
                                <input
                                  type="text"
                                  value={editDeptName}
                                  onChange={(e) => setEditDeptName(e.target.value)}
                                  onKeyDown={(e) => e.key === "Enter" && handleUpdateDept(dept.id)}
                                  autoFocus
                                  className="flex-1 px-3 py-1.5 bg-white/10 border border-blue-500 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button onClick={() => handleUpdateDept(dept.id)} className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs rounded-lg transition-colors">Save</button>
                                <button onClick={() => { setEditDeptId(null); setEditDeptName(""); }} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg transition-colors">Cancel</button>
                              </div>
                            ) : (
                              <>
                                <span className="text-sm text-white">{dept.name}</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => { setEditDeptId(dept.id); setEditDeptName(dept.name); }}
                                    className="text-xs text-blue-300 hover:text-white transition-colors"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => { if (confirm(`Delete department "${dept.name}"?`)) handleDeleteDept(dept.id); }}
                                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
