"use client";

import { useState, useEffect, useCallback } from "react";
import type { Client } from "@/types";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ client_number: "", name: "" });
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const fetchClients = useCallback(async () => {
    const res = await fetch("/api/clients");
    const data = await res.json();
    setClients(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleAdd = async () => {
    setError(null);
    if (!form.client_number || !form.name) {
      setError("Both fields are required.");
      return;
    }
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to add client");
      return;
    }
    setForm({ client_number: "", name: "" });
    setShowAdd(false);
    fetchClients();
  };

  const handleEdit = (client: Client) => {
    setEditingId(client.id);
    setForm({ client_number: client.client_number, name: client.name });
    setError(null);
  };

  const handleUpdate = async () => {
    if (editingId === null) return;
    setError(null);
    if (!form.client_number || !form.name) {
      setError("Both fields are required.");
      return;
    }
    const res = await fetch(`/api/clients/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to update client");
      return;
    }
    setEditingId(null);
    setForm({ client_number: "", name: "" });
    fetchClients();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this client and all its matters?")) return;
    const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to delete client");
      return;
    }
    fetchClients();
  };

  const handleCancel = () => {
    setEditingId(null);
    setShowAdd(false);
    setForm({ client_number: "", name: "" });
    setError(null);
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-gray-500">Loading clients...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-600 text-sm mt-1">Manage your client records.</p>
        </div>
        {!showAdd && editingId === null && (
          <button
            onClick={() => { setShowAdd(true); setForm({ client_number: "", name: "" }); setError(null); }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Add Client
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
          <p className="text-sm font-medium text-gray-700">New Client</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Client Number (e.g. CLT-005)"
              value={form.client_number}
              onChange={(e) => setForm({ ...form, client_number: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
            />
            <input
              type="text"
              placeholder="Client Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
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
              <th className="text-left px-4 py-3 font-medium text-gray-700">Client Number</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Name</th>
              <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.id} className="border-b border-gray-100 last:border-0">
                {editingId === client.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={form.client_number}
                        onChange={(e) => setForm({ ...form, client_number: e.target.value })}
                        className="border border-gray-300 rounded-lg px-2 py-1 text-sm w-full text-gray-900"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                    <td className="px-4 py-3 text-gray-900 font-mono">{client.client_number}</td>
                    <td className="px-4 py-3 text-gray-700">{client.name}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => handleEdit(client)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(client.id)}
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
            {clients.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                  No clients yet. Click &quot;Add Client&quot; to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
