"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { ALL_PAGES, PageDef } from "@/lib/pages";

interface Group {
  id: number;
  name: string;
  is_default: number;
  created_at: string;
  page_count: number;
}

interface GroupDetail extends Group {
  pageKeys: string[];
}

export default function GroupsPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/");
    }
  }, [user, router]);

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editDetail, setEditDetail] = useState<GroupDetail | null>(null);
  const [addForm, setAddForm] = useState({ name: "", pageKeys: [] as string[] });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchGroups = useCallback(async () => {
    const res = await fetch("/api/groups");
    if (res.ok) setGroups(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  async function startEdit(group: Group) {
    setError(null);
    const res = await fetch(`/api/groups/${group.id}`);
    if (res.ok) {
      const detail: GroupDetail = await res.json();
      setEditDetail(detail);
      setEditingId(group.id);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDetail(null);
    setError(null);
  }

  async function handleSaveEdit() {
    if (!editDetail) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/groups/${editDetail.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editDetail.name, pageKeys: editDetail.pageKeys }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to save");
        return;
      }
      await fetchGroups();
      cancelEdit();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(group: Group) {
    if (group.is_default) return;
    if (!confirm(`Delete group "${group.name}"? Users in this group will lose access to its pages.`)) return;
    await fetch(`/api/groups/${group.id}`, { method: "DELETE" });
    await fetchGroups();
  }

  async function handleAdd() {
    setError(null);
    if (!addForm.name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addForm.name.trim(), pageKeys: addForm.pageKeys }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to create");
        return;
      }
      setAddForm({ name: "", pageKeys: [] });
      setShowAdd(false);
      await fetchGroups();
    } finally {
      setSaving(false);
    }
  }

  function togglePageInSet(pageKey: string, current: string[], onChange: (keys: string[]) => void) {
    if (current.includes(pageKey)) {
      onChange(current.filter(k => k !== pageKey));
    } else {
      onChange([...current, pageKey]);
    }
  }

  const toolPages = ALL_PAGES.filter(p => p.group === "tools");
  const reportingPages = ALL_PAGES.filter(p => p.group === "reporting");

  function PageCheckboxGrid({ pages, selectedKeys, onChange }: { pages: PageDef[]; selectedKeys: string[]; onChange: (keys: string[]) => void }) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {pages.map(p => (
          <label key={p.key} className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedKeys.includes(p.key)}
              onChange={() => togglePageInSet(p.key, selectedKeys, onChange)}
              className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">{p.label}</span>
          </label>
        ))}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Groups</h1>
          <p className="text-sm text-gray-500 mt-1">Control which pages each group can access. Users can belong to multiple groups — permissions are the union of all their groups.</p>
        </div>
        {!showAdd && (
          <button
            onClick={() => { setShowAdd(true); setError(null); }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            New Group
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="mb-6 p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-4">New Group</h2>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
            <input
              type="text"
              value={addForm.name}
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Staging — Feature X"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Tools</p>
            <PageCheckboxGrid
              pages={toolPages}
              selectedKeys={addForm.pageKeys}
              onChange={keys => setAddForm(f => ({ ...f, pageKeys: keys }))}
            />
          </div>
          <div className="mb-5">
            <p className="text-sm font-medium text-gray-700 mb-2">Reporting</p>
            <PageCheckboxGrid
              pages={reportingPages}
              selectedKeys={addForm.pageKeys}
              onChange={keys => setAddForm(f => ({ ...f, pageKeys: keys }))}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Creating..." : "Create Group"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setError(null); setAddForm({ name: "", pageKeys: [] }); }}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Groups list */}
      <div className="space-y-3">
        {groups.map(group => (
          <div key={group.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {editingId === group.id && editDetail ? (
              <div className="p-5">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
                  <input
                    type="text"
                    value={editDetail.name}
                    onChange={e => setEditDetail(d => d ? { ...d, name: e.target.value } : d)}
                    disabled={!!group.is_default}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                  {group.is_default ? (
                    <p className="text-xs text-gray-400 mt-1">Default group name cannot be changed.</p>
                  ) : null}
                </div>
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Tools</p>
                  <PageCheckboxGrid
                    pages={toolPages}
                    selectedKeys={editDetail.pageKeys}
                    onChange={keys => setEditDetail(d => d ? { ...d, pageKeys: keys } : d)}
                  />
                </div>
                <div className="mb-5">
                  <p className="text-sm font-medium text-gray-700 mb-2">Reporting</p>
                  <PageCheckboxGrid
                    pages={reportingPages}
                    selectedKeys={editDetail.pageKeys}
                    onChange={keys => setEditDetail(d => d ? { ...d, pageKeys: keys } : d)}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{group.name}</span>
                    {group.is_default ? (
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-medium">Default</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{group.page_count} page{group.page_count !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEdit(group)}
                    className="px-3 py-1.5 text-sm text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors font-medium"
                  >
                    Edit
                  </button>
                  {!group.is_default && (
                    <button
                      onClick={() => handleDelete(group)}
                      className="px-3 py-1.5 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors font-medium"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-8">No groups yet.</p>
        )}
      </div>
    </div>
  );
}
