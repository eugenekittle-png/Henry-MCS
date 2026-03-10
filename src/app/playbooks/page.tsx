"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

interface Playbook { id: number; name: string; description: string | null; created_at: string; item_count: number; }

export default function PlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Playbook | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/playbooks");
    const d = await res.json();
    setPlaybooks(d.playbooks ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setFormName("");
    setFormDesc("");
    setError(null);
    setShowForm(true);
  }

  function openEdit(p: Playbook) {
    setEditing(p);
    setFormName(p.name);
    setFormDesc(p.description ?? "");
    setError(null);
    setShowForm(true);
  }

  async function handleSave() {
    if (!formName.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    const url = editing ? `/api/playbooks/${editing.id}` : "/api/playbooks";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: formName, description: formDesc }) });
    setSaving(false);
    if (!res.ok) { const d = await res.json(); setError(d.error || "Failed to save"); return; }
    setShowForm(false);
    load();
  }

  async function handleDelete(p: Playbook) {
    if (!confirm(`Delete playbook "${p.name}"? This will also delete all its checklist items.`)) return;
    await fetch(`/api/playbooks/${p.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Playbooks</h1>
          <p className="text-gray-500 text-sm mt-1">Define review checklists for different contract types</p>
        </div>
        <button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          + New Playbook
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : playbooks.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium mb-2">No playbooks yet</p>
          <p className="text-sm">Create a playbook to define a review checklist for a contract type.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {playbooks.map(p => (
            <div key={p.id} className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4 hover:border-gray-300 transition-colors">
              <div className="min-w-0">
                <h2 className="font-semibold text-gray-900 text-sm">{p.name}</h2>
                {p.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{p.description}</p>}
                <p className="text-xs text-gray-400 mt-1">{p.item_count} checklist item{p.item_count !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => openEdit(p)} className="text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">Edit</button>
                <button onClick={() => handleDelete(p)} className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg border border-red-100 hover:border-red-300 transition-colors">Delete</button>
                <Link href={`/playbooks/${p.id}`} className="text-xs font-medium bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors">
                  Manage Items →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">{editing ? "Edit Playbook" : "New Playbook"}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. NDA Review" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                <input value={formDesc} onChange={e => setFormDesc(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Brief description of this playbook" />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
            <div className="flex gap-2 mt-6 justify-end">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg border border-gray-200 hover:border-gray-300">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Saving..." : editing ? "Save Changes" : "Create Playbook"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
