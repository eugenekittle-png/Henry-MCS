"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";

interface PlaybookItem { id: number; playbook_id: number; order_num: number; check_name: string; instruction: string; }
interface Playbook { id: number; name: string; description: string | null; }

export default function PlaybookItemsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [items, setItems] = useState<PlaybookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<PlaybookItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editInstruction, setEditInstruction] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addInstruction, setAddInstruction] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/playbooks/${id}`);
    const d = await res.json();
    setPlaybook(d.playbook ?? null);
    setItems(d.items ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function handleAdd() {
    if (!addName.trim() || !addInstruction.trim()) { setError("Both fields are required"); return; }
    setSaving(true);
    setError(null);
    const orderNum = items.length > 0 ? Math.max(...items.map(i => i.order_num)) + 1 : 0;
    const res = await fetch(`/api/playbooks/${id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ check_name: addName, instruction: addInstruction, order_num: orderNum }),
    });
    setSaving(false);
    if (!res.ok) { const d = await res.json(); setError(d.error || "Failed"); return; }
    setAddName(""); setAddInstruction(""); setShowAdd(false);
    load();
  }

  async function handleEditSave() {
    if (!editingItem) return;
    if (!editName.trim() || !editInstruction.trim()) { setError("Both fields are required"); return; }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/playbooks/${id}/items/${editingItem.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ check_name: editName, instruction: editInstruction, order_num: editingItem.order_num }),
    });
    setSaving(false);
    if (!res.ok) { const d = await res.json(); setError(d.error || "Failed"); return; }
    setEditingItem(null);
    load();
  }

  async function handleDelete(item: PlaybookItem) {
    if (!confirm(`Delete "${item.check_name}"?`)) return;
    await fetch(`/api/playbooks/${id}/items/${item.id}`, { method: "DELETE" });
    load();
  }

  async function handleMove(item: PlaybookItem, direction: "up" | "down") {
    const idx = items.indexOf(item);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const other = items[swapIdx];
    // Swap order_nums
    await Promise.all([
      fetch(`/api/playbooks/${id}/items/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ check_name: item.check_name, instruction: item.instruction, order_num: other.order_num }) }),
      fetch(`/api/playbooks/${id}/items/${other.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ check_name: other.check_name, instruction: other.instruction, order_num: item.order_num }) }),
    ]);
    load();
  }

  if (loading) return <div className="max-w-4xl mx-auto px-4 py-10 text-gray-400 text-sm">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/playbooks" className="text-sm text-blue-600 hover:underline">← Playbooks</Link>
      </div>
      <div className="flex items-center justify-between mb-6 mt-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{playbook?.name ?? "Playbook"}</h1>
          {playbook?.description && <p className="text-gray-500 text-sm mt-1">{playbook.description}</p>}
        </div>
        <button onClick={() => { setShowAdd(true); setAddName(""); setAddInstruction(""); setError(null); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          + Add Item
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-xl text-gray-400">
          <p className="font-medium mb-1">No checklist items yet</p>
          <p className="text-sm">Add items to define what AI should check when reviewing a document with this playbook.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4">
              {editingItem?.id === item.id ? (
                <div className="space-y-3">
                  <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Check name" autoFocus />
                  <textarea value={editInstruction} onChange={e => setEditInstruction(e.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Instruction for AI..." />
                  {error && <p className="text-xs text-red-600">{error}</p>}
                  <div className="flex gap-2">
                    <button onClick={handleEditSave} disabled={saving} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
                    <button onClick={() => setEditingItem(null)} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 rounded-lg border border-gray-200">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-1 flex-shrink-0 mt-0.5">
                    <button onClick={() => handleMove(item, "up")} disabled={idx === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs leading-none">▲</button>
                    <button onClick={() => handleMove(item, "down")} disabled={idx === items.length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs leading-none">▼</button>
                  </div>
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-mono font-medium">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{item.check_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.instruction}</p>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => { setEditingItem(item); setEditName(item.check_name); setEditInstruction(item.instruction); setError(null); }} className="text-xs text-gray-500 hover:text-gray-800 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">Edit</button>
                    <button onClick={() => handleDelete(item)} className="text-xs text-red-500 hover:text-red-700 px-2.5 py-1.5 rounded-lg border border-red-100 hover:border-red-300 transition-colors">Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add item modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Add Checklist Item</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Check Name *</label>
                <input value={addName} onChange={e => setAddName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Limitation of Liability" autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Instruction *</label>
                <textarea value={addInstruction} onChange={e => setAddInstruction(e.target.value)} rows={4} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="What should the AI check for? Be specific." />
                <p className="text-xs text-gray-400 mt-1">This instruction is sent directly to the AI when reviewing a document.</p>
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
            <div className="flex gap-2 mt-6 justify-end">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg border border-gray-200">Cancel</button>
              <button onClick={handleAdd} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "Adding..." : "Add Item"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
