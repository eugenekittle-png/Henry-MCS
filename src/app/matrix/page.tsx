"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import ClientMatterSelect from "@/components/ClientMatterSelect";
import type { Client, Matter } from "@/types";

const SESSION_KEY = "matrix_client_matter";

function saveSession(client: Client, matter: Matter) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ client, matter })); } catch { /* ignore */ }
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
function restoreSession(): { client: Client; matter: Matter } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

interface MatrixTemplate {
  id: number;
  name: string;
  description: string | null;
  client_number: string | null;
  matter_number: string | null;
  created_at: string;
  column_count: number;
}

export default function MatrixPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Filter (optional)
  const restored = restoreSession();
  const [filterClient, setFilterClient] = useState<Client | null>(restored?.client ?? null);
  const [filterMatter, setFilterMatter] = useState<Matter | null>(restored?.matter ?? null);
  const [showFilter, setShowFilter] = useState(!!restored);

  const [templates, setTemplates] = useState<MatrixTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Saved banner
  const [savedMsg, setSavedMsg] = useState("");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showSaved(msg = "Changes saved") {
    setSavedMsg(msg);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedMsg(""), 3000);
  }

  // New template form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formClient, setFormClient] = useState<Client | null>(filterClient);
  const [formMatter, setFormMatter] = useState<Matter | null>(filterMatter);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Edit template name/description
  const [editing, setEditing] = useState<{ id: number; name: string; description: string } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // Copy template
  const [copying, setCopying] = useState<MatrixTemplate | null>(null);
  const [copyName, setCopyName] = useState("");
  const [copyClient, setCopyClient] = useState<Client | null>(null);
  const [copyMatter, setCopyMatter] = useState<Matter | null>(null);
  const [copySaving, setCopySaving] = useState(false);
  const [copyError, setCopyError] = useState("");

  const load = useCallback(async (clientNumber?: string, matterNumber?: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (clientNumber) params.set("clientNumber", clientNumber);
      if (matterNumber) params.set("matterNumber", matterNumber);
      const res = await fetch(`/api/matrix/templates?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTemplates(data.templates);
    } catch {
      setError("Could not load templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && user.role !== "admin" && !user.pages.includes("matrix")) {
      router.replace("/");
    }
  }, [user, router]);

  useEffect(() => {
    load(filterClient?.client_number, filterMatter?.matter_number);
  }, [load, filterClient, filterMatter]);

  function handleFilterSelect(c: Client, m: Matter) {
    setFilterClient(c);
    setFilterMatter(m);
    saveSession(c, m);
  }

  function handleFilterClear() {
    setFilterClient(null);
    setFilterMatter(null);
    clearSession();
  }

  function openCreateForm() {
    setFormName("");
    setFormDesc("");
    setFormClient(filterClient);
    setFormMatter(filterMatter);
    setFormError("");
    setShowForm(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!formName.trim()) { setFormError("Name is required."); return; }
    if (!formClient || !formMatter) { setFormError("Client and matter are required."); return; }
    setFormSaving(true);
    try {
      const res = await fetch("/api/matrix/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          description: formDesc.trim(),
          clientId: formClient.id,
          matterId: formMatter.id,
          clientNumber: formClient.client_number,
          matterNumber: formMatter.matter_number,
        }),
      });
      if (!res.ok) { const d = await res.json(); setFormError(d.error || "Failed to create."); return; }
      const { id } = await res.json();
      router.push(`/matrix/${id}`);
    } catch {
      setFormError("Failed to create.");
    } finally {
      setFormSaving(false);
    }
  }

  async function handleEditSave() {
    if (!editing) return;
    if (!editing.name.trim()) return;
    setEditSaving(true);
    const res = await fetch(`/api/matrix/templates/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editing.name.trim(), description: editing.description.trim() }),
    });
    if (res.ok) {
      setTemplates((prev) =>
        prev.map((t) => t.id === editing.id
          ? { ...t, name: editing.name.trim(), description: editing.description.trim() || null }
          : t
        )
      );
      showSaved("Template updated");
    }
    setEditing(null);
    setEditSaving(false);
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/matrix/templates/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      showSaved("Template deleted");
    }
    setDeleteConfirm(null);
  }

  async function handleCopy() {
    if (!copying || !copyClient || !copyMatter) return;
    if (!copyName.trim()) { setCopyError("Name is required."); return; }
    setCopySaving(true);
    setCopyError("");
    try {
      const res = await fetch(`/api/matrix/templates/${copying.id}/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: copyName.trim(),
          clientId: copyClient.id,
          matterId: copyMatter.id,
          clientNumber: copyClient.client_number,
          matterNumber: copyMatter.matter_number,
        }),
      });
      if (!res.ok) { const d = await res.json(); setCopyError(d.error || "Failed to copy."); return; }
      setCopying(null);
      showSaved("Template copied");
      load(filterClient?.client_number, filterMatter?.matter_number);
    } catch {
      setCopyError("Failed to copy.");
    } finally {
      setCopySaving(false);
    }
  }

  if (!user) return null;

  // Group templates by client/matter for display
  const grouped = templates.reduce<Record<string, MatrixTemplate[]>>((acc, t) => {
    const key = t.client_number && t.matter_number
      ? `${t.client_number} / ${t.matter_number}`
      : "No client / matter";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Matrix</h1>
            <a href="/help#matrix" title="Help" className="flex items-center justify-center w-6 h-6 rounded-full border border-gray-400 text-gray-500 hover:border-gray-600 hover:text-gray-700 transition-colors text-xs font-semibold">
              ?
            </a>
          </div>
          <p className="text-sm text-gray-500 mt-1">Build extraction templates to pull structured data from documents</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilter((v) => !v)}
            className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors flex items-center gap-1.5 ${
              showFilter ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600 hover:border-gray-400"
            }`}
            title="Filter by client / matter"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
            </svg>
            {filterClient && filterMatter ? `${filterClient.client_number} / ${filterMatter.matter_number}` : "Filter"}
          </button>
          <button
            onClick={openCreateForm}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Template
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilter && (
        <div className="mb-5">
          <ClientMatterSelect
            onSelect={handleFilterSelect}
            onClear={handleFilterClear}
            initialClient={restored?.client}
            initialMatter={restored?.matter}
          />
          {filterClient && filterMatter && (
            <p className="text-xs text-gray-500 mt-2 ml-1">
              Showing templates for {filterClient.client_number} / {filterMatter.matter_number} only.{" "}
              <button onClick={() => setShowFilter(false)} className="text-blue-600 hover:underline">Show all</button>
            </p>
          )}
        </div>
      )}

      {/* Saved banner */}
      {savedMsg && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {savedMsg}
        </div>
      )}

      {/* New template form */}
      {showForm && (
        <form onSubmit={handleCreate} className="mb-5 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">New Template</h2>
          {formError && <p className="text-sm text-red-600 mb-3">{formError}</p>}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
              <input
                autoFocus
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. NDA Key Terms"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Description <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Brief description of what this template extracts"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Client &amp; Matter</label>
              <ClientMatterSelect
                onSelect={(c, m) => { setFormClient(c); setFormMatter(m); }}
                onClear={() => { setFormClient(null); setFormMatter(null); }}
                initialClient={formClient ?? undefined}
                initialMatter={formMatter ?? undefined}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              disabled={formSaving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {formSaving ? "Creating…" : "Create & Add Columns"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-gray-400 bg-white border border-gray-200 rounded-xl">
          <p className="text-base font-medium">{filterClient ? "No templates for this client / matter" : "No templates yet"}</p>
          <p className="text-sm mt-1">Create one to define the columns you want to extract</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([groupKey, groupTemplates]) => (
            <div key={groupKey}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">{groupKey}</p>
              <div className="space-y-3">
                {groupTemplates.map((t) => (
                  <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">

                    {/* Edit name/description */}
                    {editing?.id === t.id ? (
                      <div className="space-y-2">
                        <input
                          autoFocus
                          value={editing.name}
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                        />
                        <input
                          value={editing.description}
                          onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                          placeholder="Description (optional)"
                          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                        />
                        <div className="flex gap-2 pt-1">
                          <button onClick={handleEditSave} disabled={editSaving} className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50">
                            {editSaving ? "Saving…" : "Save"}
                          </button>
                          <button onClick={() => setEditing(null)} className="px-3 py-1 text-xs text-gray-600 hover:text-gray-900">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <button
                            onClick={() => router.push(`/matrix/${t.id}/extract`)}
                            className="font-medium text-gray-900 hover:text-blue-600 transition-colors text-left"
                          >
                            {t.name}
                          </button>
                          {t.description && <p className="text-sm text-gray-500 mt-0.5">{t.description}</p>}
                          <p className="text-xs text-gray-400 mt-1">
                            {t.column_count} {t.column_count === 1 ? "column" : "columns"} &middot; {new Date(t.created_at + "Z").toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => router.push(`/matrix/${t.id}/extract`)}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Extract
                          </button>
                          <button
                            onClick={() => router.push(`/matrix/${t.id}`)}
                            className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            Columns
                          </button>
                          <button
                            onClick={() => { setCopying(t); setCopyName(`Copy of ${t.name}`); setCopyClient(null); setCopyMatter(null); setCopyError(""); }}
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
                            title="Copy to another client / matter"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setEditing({ id: t.id, name: t.name, description: t.description ?? "" })}
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
                            title="Rename"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(t.id)}
                            className="p-1.5 text-gray-300 hover:text-red-500 rounded transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Copy panel */}
                    {copying?.id === t.id && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Copy to Another Client / Matter</p>
                        {copyError && <p className="text-sm text-red-600 mb-2">{copyError}</p>}
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">New Template Name</label>
                            <input
                              autoFocus
                              value={copyName}
                              onChange={(e) => setCopyName(e.target.value)}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                            />
                          </div>
                          <ClientMatterSelect
                            onSelect={(c, m) => { setCopyClient(c); setCopyMatter(m); }}
                            onClear={() => { setCopyClient(null); setCopyMatter(null); }}
                          />
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={handleCopy}
                            disabled={copySaving || !copyClient || !copyMatter}
                            className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            {copySaving ? "Copying…" : "Copy Template"}
                          </button>
                          <button onClick={() => setCopying(null)} className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Delete confirm */}
                    {deleteConfirm === t.id && (
                      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3">
                        <p className="text-sm text-gray-600 flex-1">Delete <strong>{t.name}</strong> and all its columns?</p>
                        <button onClick={() => handleDelete(t.id)} className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
                        <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
