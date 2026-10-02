"use client";

import { useState, useEffect, useRef, useCallback, FormEvent } from "react";
import Script from "next/script";
import ChatPanel from "./ChatPanel";
import AutomatePanel from "./AutomatePanel";
import MatterPicker, { type ClientRow, type MatterRow } from "./MatterPicker";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface User { username: string; role: string }

export default function WordAddinPage() {
  const [officeReady, setOfficeReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [selectedMatter, setSelectedMatter] = useState<MatterRow | null>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "automate">("chat");
  // Bumping this remounts the chat panel, which starts a fresh conversation
  const [chatKey, setChatKey] = useState(0);

  const tokenRef = useRef<string | null>(null);
  const authHeaders = useCallback((): HeadersInit => (
    tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}
  ), []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.user?.username) {
          setUser({ username: d.user.username, role: d.user.role });
          if (d.token) tokenRef.current = d.token;
        }
      })
      .catch(() => {})
      .finally(() => setAuthLoading(false));
  }, []);

  // Restore persisted client/matter and the initial tab (?tab=automate from the ribbon)
  useEffect(() => {
    try {
      const client = localStorage.getItem("addin_selectedClient");
      const matter = localStorage.getItem("addin_selectedMatter");
      if (client) setSelectedClient(JSON.parse(client));
      if (matter) setSelectedMatter(JSON.parse(matter));
    } catch { /* ignore */ }
    if (new URLSearchParams(window.location.search).get("tab") === "automate") setActiveTab("automate");
  }, []);

  function handleMatterChange(client: ClientRow | null, matter: MatterRow | null) {
    setSelectedClient(client);
    setSelectedMatter(matter);
    try {
      if (client) localStorage.setItem("addin_selectedClient", JSON.stringify(client));
      else localStorage.removeItem("addin_selectedClient");
      if (matter) localStorage.setItem("addin_selectedMatter", JSON.stringify(matter));
      else localStorage.removeItem("addin_selectedMatter");
    } catch { /* ignore */ }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginUsername, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setLoginError(data.error || "Login failed"); return; }
      if (data.mustChangePassword) {
        setLoginError("Please visit the Henry MCS web app to set your password before using this add-in.");
        return;
      }
      if (data.token) tokenRef.current = data.token;
      setUser({ username: data.username, role: data.role });
    } catch {
      setLoginError("Something went wrong. Please try again.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    tokenRef.current = null;
    setUser(null);
  }

  const matterRequired = !selectedClient || !selectedMatter;
  const tabCls = (tab: typeof activeTab) =>
    `px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${activeTab === tab ? "bg-white/15 text-white" : "text-gray-400 hover:text-white"}`;

  return (
    <>
      <Script
        src="https://appsforoffice.microsoft.com/lib/1/hosted/office.js"
        onLoad={() => (window as any).Office.onReady(() => setOfficeReady(true))}
      />

      <div className="flex flex-col h-screen bg-gray-50 text-sm overflow-hidden">

        {/* Header */}
        <div className="bg-gray-900 px-3 py-2 flex items-center gap-2 flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/henry-mcs.png" alt="" style={{ height: "20px", width: "auto" }} />
          {user ? (
            <>
              <div className="flex items-center gap-0.5 ml-1">
                <button onClick={() => setActiveTab("chat")} className={tabCls("chat")}>Assistant</button>
                <button onClick={() => setActiveTab("automate")} className={tabCls("automate")}>Templates</button>
              </div>
              <div className="ml-auto flex items-center gap-2.5">
                {activeTab === "chat" && (
                  <button onClick={() => setChatKey(k => k + 1)} className="text-gray-400 hover:text-white text-xs" title="Start a new conversation">New chat</button>
                )}
                <button onClick={handleLogout} className="text-gray-500 hover:text-white text-xs" title={`Signed in as ${user.username}`}>Sign out</button>
              </div>
            </>
          ) : (
            <span className="text-white font-semibold text-sm">Henry MCS</span>
          )}
        </div>

        {authLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">Loading...</div>

        ) : !user ? (
          /* ── Login ── */
          <div className="flex-1 flex flex-col justify-center px-4 py-6">
            <p className="text-gray-500 text-xs text-center mb-5">Sign in to continue</p>
            <form onSubmit={handleLogin} className="space-y-3">
              <input
                type="email" placeholder="Email" value={loginUsername}
                onChange={e => setLoginUsername(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="password" placeholder="Password" value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {loginError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{loginError}</p>
              )}
              <button
                type="submit" disabled={loginLoading}
                className="w-full bg-gray-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {loginLoading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          </div>

        ) : (
          /* ── Main UI ── */
          <div className="flex-1 flex flex-col overflow-hidden">
            <MatterPicker authHeaders={authHeaders} client={selectedClient} matter={selectedMatter} onChange={handleMatterChange} />

            {activeTab === "chat" ? (
              <ChatPanel
                key={chatKey}
                officeReady={officeReady}
                authHeaders={authHeaders}
                matterRequired={matterRequired}
                clientLabel={selectedClient ? `${selectedClient.client_number} - ${selectedClient.name}` : ""}
                matterLabel={selectedMatter ? `${selectedMatter.matter_number} - ${selectedMatter.description}` : ""}
                clientNumber={selectedClient?.client_number ?? null}
                matterNumber={selectedMatter?.matter_number ?? null}
              />
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                <AutomatePanel officeReady={officeReady} tokenRef={tokenRef} selectedClient={selectedClient} selectedMatter={selectedMatter} />
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
