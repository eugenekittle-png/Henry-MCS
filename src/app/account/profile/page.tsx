"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthContext";

export default function ProfilePage() {
  const { user, login } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/user/profile");
      if (res.ok) {
        const data = await res.json();
        setFirstName(data.first_name ?? "");
        setLastName(data.last_name ?? "");
        setEmail(data.email ?? "");
      }
    }
    if (user) load();
  }, [user]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage({ type: "error", text: "A valid email address is required." });
      return;
    }

    setSaving(true);
    const res = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, email }),
    });
    setSaving(false);

    if (!res.ok) {
      const data = await res.json();
      setMessage({ type: "error", text: data.error || "Failed to save." });
      return;
    }

    // Update auth context with new email if it changed
    if (user && email !== user.email) {
      login(user.username, email, user.role);
    }

    setMessage({ type: "success", text: "Profile saved." });
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Profile</h1>
      <p className="text-sm text-gray-500 mb-8">Your personal information and login email.</p>

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">This is also your login email. Changing it takes effect immediately.</p>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={saving}
                className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
              {message && (
                <p className={`text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
                  {message.text}
                </p>
              )}
            </div>
          </div>
        </form>
      </div>

      <div className="mt-6 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Principal ID</h2>
        <p className="text-xs text-gray-400 mb-2">Your system-assigned identifier. This cannot be changed.</p>
        <code className="text-sm font-mono text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200 inline-block">
          {user?.username ?? "—"}
        </code>
      </div>
    </div>
  );
}
