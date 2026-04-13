"use client";

import { useState, useEffect, useCallback } from "react";
import { downloadCSV } from "@/lib/csv";

interface User {
  id: number;
  username: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: "admin" | "user";
  created_at: string;
  failed_login_attempts: number;
  locked_until: string | null;
  totp_enabled: number;
  last_login_at: string | null;
}

type SortKey = "name" | "email" | "role" | "totp_enabled" | "created_at" | "last_login_at";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", password: "", role: "user" as "admin" | "user" });
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", email: "", role: "user" as "admin" | "user", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [require2fa, setRequire2fa] = useState(false);
  const [require2faSaving, setRequire2faSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    const [usersRes, settingsRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/admin/settings"),
    ]);
    const data = await usersRes.json();
    setUsers(data);
    if (settingsRes.ok) {
      const settings = await settingsRes.json();
      setRequire2fa(settings.require2fa);
    }
    setLoading(false);
  }, []);

  async function handleRequire2faToggle(value: boolean) {
    setRequire2faSaving(true);
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ require2fa: value }),
    });
    setRequire2fa(value);
    setRequire2faSaving(false);
  }

  async function handleDisable2fa(user: User) {
    if (!confirm(`Disable 2FA for ${user.email}?`)) return;
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: user.role, disable2fa: true }),
    });
    if (res.ok) fetchUsers();
  }

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleAdd = async () => {
    setError(null);
    if (!form.email || !form.password) {
      setError("Email and password are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Invalid email address.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to add user");
      return;
    }
    setForm({ first_name: "", last_name: "", email: "", password: "", role: "user" });
    setShowAdd(false);
    fetchUsers();
  };

  const handleEdit = (user: User) => {
    setEditingId(user.id);
    setEditForm({ first_name: user.first_name ?? "", last_name: user.last_name ?? "", email: user.email, role: user.role, password: "" });
    setError(null);
  };

  const handleUpdate = async () => {
    if (editingId === null) return;
    setError(null);
    if (!editForm.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email)) {
      setError("Invalid email address.");
      return;
    }
    if (editForm.password && editForm.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    const body: Record<string, string> = { role: editForm.role, email: editForm.email, first_name: editForm.first_name, last_name: editForm.last_name };
    if (editForm.password) body.password = editForm.password;
    const res = await fetch(`/api/users/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to update user");
      return;
    }
    setEditingId(null);
    fetchUsers();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this user?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to delete user");
    }
    fetchUsers();
  };

  const handleUnlock = async (user: User) => {
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: user.role, unlock: true }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to unlock account");
      return;
    }
    fetchUsers();
  };

  const isLocked = (user: User) => !!user.locked_until && new Date(user.locked_until + "Z") > new Date();

  const handleCancel = () => {
    setEditingId(null);
    setShowAdd(false);
    setForm({ first_name: "", last_name: "", email: "", password: "", role: "user" });
    setEditForm({ first_name: "", last_name: "", email: "", role: "user", password: "" });
    setError(null);
  };

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const fullName = (u: User) => [u.first_name, u.last_name].filter(Boolean).join(" ") || null;

  const sortedUsers = [...users].sort((a, b) => {
    let av: string | number, bv: string | number;
    if (sortKey === "name") { av = fullName(a)?.toLowerCase() ?? ""; bv = fullName(b)?.toLowerCase() ?? ""; }
    else if (sortKey === "email") { av = a.email.toLowerCase(); bv = b.email.toLowerCase(); }
    else if (sortKey === "role") { av = a.role; bv = b.role; }
    else if (sortKey === "totp_enabled") { av = a.totp_enabled; bv = b.totp_enabled; }
    else if (sortKey === "created_at") { av = a.created_at ?? ""; bv = b.created_at ?? ""; }
    else { av = a.last_login_at ?? ""; bv = b.last_login_at ?? ""; }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const handleDownloadCSV = () => {
    downloadCSV("users.csv", users.map(u => ({
      principal_id: u.username,
      first_name: u.first_name ?? "",
      last_name: u.last_name ?? "",
      email: u.email,
      role: u.role,
      two_fa: u.totp_enabled ? "Yes" : "No",
      created: u.created_at ? new Date(u.created_at + "Z").toLocaleDateString() : "",
      last_login: u.last_login_at ? new Date(u.last_login_at + "Z").toLocaleDateString() : "",
    })), [
      { key: "principal_id", label: "Principal ID" },
      { key: "first_name", label: "First Name" },
      { key: "last_name", label: "Last Name" },
      { key: "email", label: "Email" },
      { key: "role", label: "Role" },
      { key: "two_fa", label: "2FA" },
      { key: "created", label: "Created" },
      { key: "last_login", label: "Last Login" },
    ]);
  };

  if (loading) {
    return <div className="max-w-5xl mx-auto px-4 py-10"><p className="text-gray-500">Loading users...</p></div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-600 text-sm mt-1">Manage user accounts and roles.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDownloadCSV}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Download CSV
          </button>
          {!showAdd && editingId === null && (
            <button
              onClick={() => { setShowAdd(true); setError(null); }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Add User
            </button>
          )}
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Security Settings</h2>
        <p className="text-xs text-gray-500 mb-4">Firm-wide security policy applied to all users.</p>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">Require Two-Factor Authentication</p>
            <p className="text-xs text-gray-500 mt-0.5">Users without 2FA will be redirected to set it up immediately after login.</p>
          </div>
          <button
            onClick={() => handleRequire2faToggle(!require2fa)}
            disabled={require2faSaving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${require2fa ? "bg-blue-600" : "bg-gray-300"} disabled:opacity-50`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${require2fa ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Add User form */}
      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">New User</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="First name"
              value={form.first_name}
              onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
            />
            <input
              type="text"
              placeholder="Last name"
              value={form.last_name}
              onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="email"
              placeholder="Email address"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
            />
            <input
              type="password"
              placeholder="Password (min 8 chars)"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "user" })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">Save</button>
            <button onClick={handleCancel} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {(["name", "email", "role", "totp_enabled", "created_at", "last_login_at"] as SortKey[]).map((key) => {
                const labels: Record<SortKey, string> = { name: "Name", email: "Email", role: "Role", totp_enabled: "2FA", created_at: "Created", last_login_at: "Last Login" };
                const active = sortKey === key;
                return (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="text-left px-4 py-3 font-medium text-gray-700 cursor-pointer select-none hover:bg-gray-100 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      {labels[key]}
                      <span className={`text-xs ${active ? "text-blue-600" : "text-gray-300"}`}>
                        {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                      </span>
                    </span>
                  </th>
                );
              })}
              <th className="text-right px-4 py-3 font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => (
              <tr key={user.id} className="border-b border-gray-100 last:border-0">
                {editingId === user.id ? (
                  <>
                    <td className="px-4 py-3" colSpan={7}>
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="First name"
                            value={editForm.first_name}
                            onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900"
                          />
                          <input
                            type="text"
                            placeholder="Last name"
                            value={editForm.last_name}
                            onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="email"
                            placeholder="Email"
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900"
                          />
                          <select
                            value={editForm.role}
                            onChange={(e) => setEditForm({ ...editForm, role: e.target.value as "admin" | "user" })}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900"
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                          <input
                            type="password"
                            placeholder="New password (leave blank to keep)"
                            value={editForm.password}
                            onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900"
                          />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button onClick={handleUpdate} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Save</button>
                          <button onClick={handleCancel} className="text-gray-500 hover:text-gray-700 text-sm font-medium">Cancel</button>
                        </div>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      <div>
                        {fullName(user) ? (
                          <span className="text-gray-900">{fullName(user)}</span>
                        ) : (
                          <span className="text-gray-400 italic text-xs">No name</span>
                        )}
                        {isLocked(user) && (
                          <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700" title="Account locked">Locked</span>
                        )}
                        <p className="text-xs font-mono text-gray-400 mt-0.5">{user.username}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${user.role === "admin" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {user.totp_enabled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          On
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Off</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {user.created_at ? new Date(user.created_at + "Z").toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {user.last_login_at ? new Date(user.last_login_at + "Z").toLocaleString() : <span className="text-gray-300">Never</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        {isLocked(user) && (
                          <button onClick={() => handleUnlock(user)} className="text-green-600 hover:text-green-800 text-sm font-medium">Unlock</button>
                        )}
                        {user.totp_enabled ? (
                          <button onClick={() => handleDisable2fa(user)} className="text-amber-600 hover:text-amber-800 text-sm font-medium">Disable 2FA</button>
                        ) : null}
                        <button onClick={() => handleEdit(user)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Edit</button>
                        <button onClick={() => handleDelete(user.id)} className="text-red-600 hover:text-red-800 text-sm font-medium">Delete</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  No users yet. Click &quot;Add User&quot; to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
