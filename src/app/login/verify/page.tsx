"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";

export default function VerifyPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [usedBackup, setUsedBackup] = useState(false);
  const [remainingBackup, setRemainingBackup] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Invalid code"); return; }

      if (data.usedBackupCode) {
        setUsedBackup(true);
        setRemainingBackup(data.remainingBackupCodes);
      }

      login(data.username, data.email ?? "", data.role);
      if (data.mustChangePassword) {
        router.push("/change-password");
      } else {
        router.push("/");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/henry-mcs.png" alt="Henry MCS" className="h-10 w-auto mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">Two-Factor Authentication</h1>
          <p className="text-sm text-gray-500 mt-2">Enter the 6-digit code from your authenticator app, or a backup code.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {usedBackup && remainingBackup !== null && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              Backup code used. {remainingBackup} backup code{remainingBackup !== 1 ? "s" : ""} remaining.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
              <input
                ref={inputRef}
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="000000 or XXXX-XXXX"
                maxLength={9}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-center text-xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                autoComplete="one-time-code"
              />
            </div>

            {error && <p className="text-sm text-red-600 text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading || !token.trim()}
              className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Verifying…" : "Verify"}
            </button>
          </form>

          <button
            onClick={() => router.push("/login")}
            className="w-full mt-4 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
