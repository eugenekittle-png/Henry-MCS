"use client";

import { useState, useEffect, useCallback } from "react";
import type { Client } from "@/types";

interface MatterRow {
  id: number;
  client_id: number;
  matter_number: string;
  description: string;
  client_number: string;
  client_name: string;
}

export default function MattersPage() {
  const [matters, setMatters] = useState<MatterRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ client_id: "", matter_number: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const fetchData = useCallback(async () => {
    const [mattersRes, clientsRes] = await Promise.all([
      fetch("/api/matters"),
      fetch("/api/clients"),
    ]);
    setMatters(await mattersRes.json());
    setClients(await clientsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = async () => {
    setError(null);
    if (!form.client_id || !form.matter_number || !form.description) {
      setError("All fields are required.");
      return;
    }
    const res = await fetch(`/api/clients/${form.client_id}/matters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matter_number: form.matter_number, description: form.description }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to add matter");
      return;
    }
    setForm({ client_id: "", matter_number: "", description: "" });
    setShowAdd(false);
    fetchData();
  };

  const handleEdit = (matter: MatterRow) => {
    setEditingId(matter.id);
    setForm({ client_id: String(matter.client_id), matter_number: matter.matter_number, description: matter.description });
    setError(null);
  };

  const handleUpdate = async () => {
    if (editingId === null) return;
    setError(null);
    if (!form.matter_number || !form.description) {
      setError("Matter number and description are required.");
      return;
    }
    const res = await fetch(`/api/matters/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matter_number: form.matter_number, description: form.description }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to update matter");
      return;
    }
    setEditingId(null);
    setForm({ client_id: "", matter_number: "", description: "" });
    fetchData();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this matter?")) return;
    const res = await fetch(`/api/matters/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to delete matter");
      return;
    }
    fetchData();
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowAdd(false);
    setForm({ client_id: "", matter_number: "", description: "" });
    setError(null);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <p className="text-gray-500">Loading matters...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Matters</h1>
          <p className="text-gray-600 text-sm mt-1">Manage matters across all clients.</p>
        </div>
        {!showAdd && editingId === null && (
          <button
            onClick={() => { setShowAdd(true); setForm({ client_id: "", matter_number: "", description: "" }); setError(null); }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Add Matter
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
          <p className="text-sm font-medium text-gray-700">New Matter</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
            >
              <option value="">Select client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.client_number} — {c.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Matter Number (e.g. MTR-001)"
              value={form.matter_number}
              onChange={(e) => setForm({ ...form, matter_number: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
            />
            <input
              type="text"
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-700">Client</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Matter Number</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Description</th>
              <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {matters.map((matter) => (
              <tr key={matter.id} className="border-b border-gray-100 last:border-0">
                {editingId === matter.id ? (
                  <>
                    <td className="px-4 py-2 text-gray-500 text-xs">
                      {matter.client_number} — {matter.client_name}
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={form.matter_number}
                        onChange={(e) => setForm({ ...form, matter_number: e.target.value })}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-full text-gray-900"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-full text-gray-900"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={handleUpdate}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancel}
                          className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      <span className="text-gray-500 font-mono text-xs">{matter.client_number}</span>
                      <span className="text-gray-700 ml-2">{matter.client_name}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-mono">{matter.matter_number}</td>
                    <td className="px-4 py-3 text-gray-700">{matter.description}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => handleEdit(matter)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(matter.id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {matters.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                  No matters yet. Click &quot;Add Matter&quot; to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
