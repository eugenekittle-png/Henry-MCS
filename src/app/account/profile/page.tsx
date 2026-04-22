"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthContext";

interface RateLimitStatus {
  allowed: boolean;
  used: number;
  limit: number;
  approaching: boolean;
  resetsAt: string | null;
}

interface DailyUsage {
  day: string;
  total: number;
}

export default function ProfilePage() {
  const { user, login } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);

  useEffect(() => {
    async function load() {
      const [profileRes, rateLimitRes, dailyRes] = await Promise.all([
        fetch("/api/user/profile"),
        fetch("/api/my-usage?groupBy=ratelimit"),
        fetch("/api/my-usage?groupBy=daily"),
      ]);
      if (profileRes.ok) {
        const data = await profileRes.json();
        setFirstName(data.first_name ?? "");
        setLastName(data.last_name ?? "");
        setEmail(data.email ?? "");
      }
      if (rateLimitRes.ok) setRateLimit(await rateLimitRes.json());
      if (dailyRes.ok) {
        const data = await dailyRes.json();
        setDailyUsage(data.rows ?? []);
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

      {/* AI Token Usage Widget — only show for non-admins with a limit */}
      {user?.role !== "admin" && rateLimit && rateLimit.limit > 0 && (
        <div className={`mt-6 bg-white rounded-xl p-6 shadow-sm border ${!rateLimit.allowed ? "border-red-300" : rateLimit.approaching ? "border-amber-300" : "border-gray-200"}`}>
          <h2 className="text-sm font-semibold text-gray-700 mb-1">AI Token Usage</h2>
          <p className="text-xs text-gray-400 mb-4">Your usage in the current 6-hour window.</p>

          {/* Approaching / limit-reached warning banners */}
          {!rateLimit.allowed && rateLimit.resetsAt && (
            <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-xs font-medium text-red-700">
                Token limit reached - AI tools are unavailable until {new Date(rateLimit.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
              </p>
            </div>
          )}
          {rateLimit.approaching && (
            <div className="mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs font-medium text-amber-700">
                You are approaching your token limit. Only {(rateLimit.limit - rateLimit.used).toLocaleString()} tokens remaining in this window.
              </p>
            </div>
          )}

          {/* Progress bar */}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600">
                {rateLimit.used.toLocaleString()} of {rateLimit.limit.toLocaleString()} tokens used
              </span>
              <span className="text-xs text-gray-500">
                {Math.round((rateLimit.used / rateLimit.limit) * 100)}%
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${!rateLimit.allowed ? "bg-red-500" : rateLimit.approaching ? "bg-amber-400" : rateLimit.used / rateLimit.limit > 0.75 ? "bg-yellow-300" : "bg-blue-500"}`}
                style={{ width: `${Math.min(100, Math.round((rateLimit.used / rateLimit.limit) * 100))}%` }}
              />
            </div>
          </div>

          {/* 7-day bar chart */}
          {dailyUsage.length > 0 && (() => {
            // Fill in all 7 days including days with zero usage
            const days: { label: string; total: number }[] = [];
            for (let i = 6; i >= 0; i--) {
              const d = new Date();
              d.setDate(d.getDate() - i);
              const key = d.toISOString().slice(0, 10);
              const found = dailyUsage.find(r => r.day === key);
              days.push({ label: d.toLocaleDateString([], { weekday: "short" }), total: found?.total ?? 0 });
            }
            const maxVal = Math.max(...days.map(d => d.total), 1);
            return (
              <div className="mt-5">
                <p className="text-xs font-medium text-gray-500 mb-2">Last 7 days</p>
                <div className="flex items-end gap-1.5 h-16">
                  {days.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex items-end justify-center" style={{ height: "48px" }}>
                        <div
                          className="w-full rounded-t bg-blue-400"
                          style={{ height: `${Math.max(2, Math.round((d.total / maxVal) * 48))}px` }}
                          title={`${d.total.toLocaleString()} tokens`}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400">{d.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
