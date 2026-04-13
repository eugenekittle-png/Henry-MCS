"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "@/components/AuthContext";
import { useRouter, useSearchParams } from "next/navigation";

type Step = "idle" | "qr" | "confirm" | "backup" | "disabling";

function SecurityPageInner() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const forcedSetup = searchParams.get("setup") === "required";


  const [totpEnabled, setTotpEnabled] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [secret, setSecret] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [disableToken, setDisableToken] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // Check if we have a pending setup cookie by trying an API call
        fetch("/api/auth/2fa/setup").then(r => { if (!r.ok) router.push("/login"); });
      }
    }
  }, [user, loading, router]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/user/profile");
        if (res.ok) {
          const data = await res.json();
          setTotpEnabled(data.totp_enabled);
        }
      } catch { /* silent */ }
    }
    if (user) load();
  }, [user]);

  async function startSetup() {
    setActionError("");
    setActionLoading(true);
    const res = await fetch("/api/auth/2fa/setup");
    const data = await res.json();
    setActionLoading(false);
    if (!res.ok) { setActionError(data.error); return; }
    setSecret(data.secret);
    setQrDataUrl(data.qrDataUrl);
    setStep("qr");
  }

  async function handleEnable(e: React.FormEvent) {
    e.preventDefault();
    setActionError("");
    setActionLoading(true);
    const res = await fetch("/api/auth/2fa/enable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, token: verifyToken }),
    });
    const data = await res.json();
    setActionLoading(false);
    if (!res.ok) { setActionError(data.error); return; }
    setBackupCodes(data.backupCodes);
    setTotpEnabled(true);
    setStep("backup");

    // If forced setup, refresh session
    if (forcedSetup) {
      setTimeout(() => router.push("/"), 500);
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setActionError("");
    setActionLoading(true);
    const res = await fetch("/api/auth/2fa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: disableToken }),
    });
    const data = await res.json();
    setActionLoading(false);
    if (!res.ok) { setActionError(data.error); return; }
    setTotpEnabled(false);
    setStep("idle");
    setDisableToken("");
  }

  if (loading) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {forcedSetup && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          <strong>Action required:</strong> Your firm requires two-factor authentication. Please set it up below before continuing.
        </div>
      )}

      <h1 className="text-2xl font-bold text-gray-900 mb-8">Security</h1>

      {/* 2FA */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-start justify-between mb-1">
          <h2 className="text-base font-semibold text-gray-900">Two-Factor Authentication</h2>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${totpEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {totpEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <p className="text-sm text-gray-500 mb-5">Protect your account with an authenticator app (Google Authenticator, Microsoft Authenticator, Authy).</p>

        {actionError && <p className="text-sm text-red-600 mb-3">{actionError}</p>}

        {/* Idle — not enabled */}
        {step === "idle" && !totpEnabled && (
          <button onClick={startSetup} disabled={actionLoading} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {actionLoading ? "Loading…" : "Set Up 2FA"}
          </button>
        )}

        {/* Show QR code */}
        {step === "qr" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">Scan this QR code with your authenticator app, then enter the 6-digit code below to confirm.</p>
            {qrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="QR Code" className="w-48 h-48 border border-gray-200 rounded-xl" />
            )}
            <details className="text-xs text-gray-400">
              <summary className="cursor-pointer hover:text-gray-600">Can&apos;t scan? Enter code manually</summary>
              <code className="block mt-1 font-mono break-all bg-gray-50 p-2 rounded">{secret}</code>
            </details>
            <form onSubmit={handleEnable} className="flex gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Verification Code</label>
                <input
                  type="text"
                  value={verifyToken}
                  onChange={(e) => setVerifyToken(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                  className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center font-mono tracking-widest focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                  autoComplete="one-time-code"
                />
              </div>
              <button type="submit" disabled={actionLoading || verifyToken.length < 6} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {actionLoading ? "Verifying…" : "Confirm & Enable"}
              </button>
              <button type="button" onClick={() => { setStep("idle"); setActionError(""); }} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Cancel
              </button>
            </form>
          </div>
        )}

        {/* Backup codes */}
        {step === "backup" && (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
              <p className="text-sm font-semibold text-green-800 mb-2">2FA enabled successfully</p>
              <p className="text-sm text-green-700 mb-3">Save these backup codes somewhere safe. Each can only be used once if you lose access to your authenticator.</p>
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code) => (
                  <code key={code} className="text-sm font-mono bg-white border border-green-200 rounded px-3 py-1.5 text-center">{code}</code>
                ))}
              </div>
            </div>
            <button onClick={() => setStep("idle")} className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors">
              Done
            </button>
          </div>
        )}

        {/* Enabled — disable option */}
        {step === "idle" && totpEnabled && (
          <div>
            {step === "idle" && (
              <button onClick={() => setStep("disabling")} className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                Disable 2FA
              </button>
            )}
          </div>
        )}

        {step === "disabling" && (
          <form onSubmit={handleDisable} className="space-y-3">
            <p className="text-sm text-gray-700">Enter your current 2FA code to confirm disabling.</p>
            <div className="flex gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Current Code</label>
                <input
                  type="text"
                  value={disableToken}
                  onChange={(e) => setDisableToken(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                  className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center font-mono tracking-widest focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
                />
              </div>
              <button type="submit" disabled={actionLoading || disableToken.length < 6} className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
                {actionLoading ? "Disabling…" : "Confirm Disable"}
              </button>
              <button type="button" onClick={() => { setStep("idle"); setActionError(""); }} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function SecurityPage() {
  return (
    <Suspense>
      <SecurityPageInner />
    </Suspense>
  );
}
