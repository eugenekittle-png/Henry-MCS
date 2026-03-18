"use client";

import { useState, useEffect, useRef, useCallback, FormEvent } from "react";
import Script from "next/script";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseContentAndCitations, citationsToMarkdown } from "@/lib/citations";

/* eslint-disable @typescript-eslint/no-explicit-any */

type View = "summarize" | "ask" | "chat";

interface User { username: string; role: string }
interface ChatMessage { role: "user" | "assistant"; content: string }


export default function WordAddinPage() {
  const [officeReady, setOfficeReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<View>("summarize");

  // Summarize state
  const [content, setContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Login state
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Matter context
  type ClientRow = { id: number; client_number: string; name: string };
  type MatterRow = { id: number; matter_number: string; description: string };
  const [clientSearch, setClientSearch] = useState("");
  const [clientResults, setClientResults] = useState<ClientRow[]>([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [showClientResults, setShowClientResults] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [matterSearch, setMatterSearch] = useState("");
  const [matterResults, setMatterResults] = useState<MatterRow[]>([]);
  const [matterSearchLoading, setMatterSearchLoading] = useState(false);
  const [showMatterResults, setShowMatterResults] = useState(false);
  const [selectedMatter, setSelectedMatter] = useState<MatterRow | null>(null);
  const clientSearchTimer = useRef<any>(null);
  const matterSearchTimer = useRef<any>(null);

  // Ask state
  const [askPrompt, setAskPrompt] = useState("");
  const [askContent, setAskContent] = useState("");
  const [askStreaming, setAskStreaming] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") === "ask") {
      setView("ask");
    }
  }, []);

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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleClientSearchInput(value: string) {
    setClientSearch(value);
    setShowClientResults(true);
    clearTimeout(clientSearchTimer.current);
    if (value.length < 2) { setClientResults([]); return; }
    clientSearchTimer.current = setTimeout(() => {
      setClientSearchLoading(true);
      const headers: HeadersInit = {};
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      fetch(`/api/clients?search=${encodeURIComponent(value)}`, { headers })
        .then(r => r.ok ? r.json() : [])
        .then(data => setClientResults(data))
        .catch(() => {})
        .finally(() => setClientSearchLoading(false));
    }, 300);
  }

  function handleSelectClient(client: { id: number; client_number: string; name: string }) {
    setSelectedClient(client);
    setClientSearch("");
    setClientResults([]);
    setShowClientResults(false);
    setSelectedMatter(null);
    setMatterSearch("");
    setMatterResults([]);
  }

  function handleClearClient() {
    setSelectedClient(null);
    setClientSearch("");
    setClientResults([]);
    setSelectedMatter(null);
    setMatterSearch("");
    setMatterResults([]);
  }

  function handleMatterSearchInput(value: string) {
    setMatterSearch(value);
    setShowMatterResults(true);
    clearTimeout(matterSearchTimer.current);
    if (value.length < 2) { setMatterResults([]); return; }
    matterSearchTimer.current = setTimeout(() => {
      if (!selectedClient) return;
      setMatterSearchLoading(true);
      const headers: HeadersInit = {};
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      fetch(`/api/clients/${selectedClient.id}/matters?search=${encodeURIComponent(value)}`, { headers })
        .then(r => r.ok ? r.json() : [])
        .then(data => setMatterResults(data))
        .catch(() => {})
        .finally(() => setMatterSearchLoading(false));
    }, 300);
  }

  function handleSelectMatter(matter: MatterRow) {
    setSelectedMatter(matter);
    setMatterSearch("");
    setMatterResults([]);
    setShowMatterResults(false);
  }

  function handleClearMatter() {
    setSelectedMatter(null);
    setMatterSearch("");
    setMatterResults([]);
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
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
    setContent("");
    setMessages([]);
    setError(null);
    setView("summarize");
  }

  function handleRefresh() {
    setContent("");
    setMessages([]);
    setError(null);
    setAskContent("");
    setAskError(null);
    setAskPrompt("");
    setView("summarize");
  }

  async function getDocumentText(selectionOnly: boolean): Promise<string> {
    return (window as any).Word.run(async (context: any) => {
      const range = selectionOnly ? context.document.getSelection() : context.document.body;
      range.load("text");
      await context.sync();
      return range.text as string;
    });
  }

  async function insertIntoDocument(text: string) {
    await (window as any).Word.run(async (context: any) => {
      const selection = context.document.getSelection();
      selection.insertText("\n\n" + text, "After");
      await context.sync();
    });
  }

  const handleSummarize = useCallback(async (selectionOnly: boolean) => {
    if (!officeReady) return;
    setContent("");
    setMessages([]);
    setError(null);
    setIsStreaming(true);
    setView("summarize");

    let docText = "";
    try {
      docText = await getDocumentText(selectionOnly);
    } catch {
      setError("Could not read the document. Make sure a Word document is open.");
      setIsStreaming(false);
      return;
    }

    if (!docText.trim()) {
      setError(selectionOnly ? "No text is selected." : "The document appears to be empty.");
      setIsStreaming(false);
      return;
    }

    try {
      const summarizeHeaders: HeadersInit = { "Content-Type": "application/json" };
      if (tokenRef.current) summarizeHeaders["Authorization"] = `Bearer ${tokenRef.current}`;
      const res = await fetch("/api/addin/summarize", {
        method: "POST",
        headers: summarizeHeaders,
        body: JSON.stringify({ text: docText, filename: selectionOnly ? "Selection" : "Document", client: clientLabel, matter: matterLabel }),
      });

      if (!res.ok) {
        let errMsg = `Request failed (${res.status})`;
        try { const data = await res.json(); if (data.error) errMsg = data.error; } catch { /* non-JSON response */ }
        throw new Error(errMsg);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) { setError(parsed.error); setIsStreaming(false); return; }
            if (parsed.text) setContent(prev => prev + parsed.text);
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsStreaming(false);
    }
  }, [officeReady]);

  const handleAsk = useCallback(async (selectionOnly: boolean) => {
    if (!officeReady || !askPrompt.trim()) return;
    setAskContent("");
    setAskError(null);
    setAskStreaming(true);

    let docText = "";
    try {
      docText = await getDocumentText(selectionOnly);
    } catch {
      setAskError("Could not read the document. Make sure a Word document is open.");
      setAskStreaming(false);
      return;
    }

    if (!docText.trim()) {
      setAskError(selectionOnly ? "No text is selected." : "The document appears to be empty.");
      setAskStreaming(false);
      return;
    }

    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      const res = await fetch("/api/addin/recommend", {
        method: "POST",
        headers,
        body: JSON.stringify({ text: docText, prompt: askPrompt.trim(), client: clientLabel, matter: matterLabel }),
      });

      if (!res.ok) {
        let errMsg = `Request failed (${res.status})`;
        try { const data = await res.json(); if (data.error) errMsg = data.error; } catch { /* non-JSON */ }
        throw new Error(errMsg);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) { setAskError(parsed.error); setAskStreaming(false); return; }
            if (parsed.text) setAskContent(prev => prev + parsed.text);
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAskStreaming(false);
    }
  }, [officeReady, askPrompt]);

  async function handleChat(e: FormEvent) {
    e.preventDefault();
    const question = chatInput.trim();
    if (!question || chatStreaming) return;

    setChatInput("");
    const { main: summaryMain } = parseContentAndCitations(content);
    const apiMessages = [
      { role: "user" as const, content: `Here is the document summary:\n\n${summaryMain}` },
      { role: "assistant" as const, content: "I've reviewed the summary. What questions do you have?" },
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: question },
    ];

    setMessages(prev => [...prev, { role: "user", content: question }]);
    setChatStreaming(true);

    try {
      const chatHeaders: HeadersInit = { "Content-Type": "application/json" };
      if (tokenRef.current) chatHeaders["Authorization"] = `Bearer ${tokenRef.current}`;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: chatHeaders,
        body: JSON.stringify({ messages: apiMessages }),
      });
      if (!res.ok) { let m = `Failed (${res.status})`; try { const d = await res.json(); if (d.error) m = d.error; } catch { /* non-JSON */ } throw new Error(m); }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";

      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              assistantContent += parsed.text;
              const snap = assistantContent;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: snap };
                return updated;
              });
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: "Sorry, something went wrong." }]);
    } finally {
      setChatStreaming(false);
    }
  }

  const clientLabel = selectedClient ? `${selectedClient.client_number} — ${selectedClient.name}` : "";
  const matterLabel = selectedMatter ? `${selectedMatter.matter_number} — ${selectedMatter.description}` : "";
  const matterRequired = !selectedClient || !selectedMatter;

  const { main, citations } = parseContentAndCitations(content);
  const hasCitations = citations.length > 0;
  const { main: askMain, citations: askCitations } = parseContentAndCitations(askContent);
  const askHasCitations = askCitations.length > 0;

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
          <img src="/images/henry-mcs.png" alt="" style={{ height: "22px", width: "auto" }} />
          <span className="text-white font-semibold text-sm">Henry MCS</span>
          {user && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-gray-400 text-xs truncate max-w-[80px]">{user.username}</span>
              <button onClick={handleRefresh} className="text-gray-400 hover:text-white text-xs transition-colors" title="Refresh">↺</button>
              <button onClick={handleLogout} className="text-gray-400 hover:text-white text-xs transition-colors" title="Sign out">Sign out</button>
            </div>
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
                type="text" placeholder="Username" value={loginUsername}
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

            {/* Client / Matter context */}
            <div className="flex gap-2 px-3 py-2 bg-white border-b border-gray-100 flex-shrink-0">
              {/* Client typeahead */}
              <div className="flex-1 min-w-0 relative">
                {selectedClient ? (
                  <div className="flex items-center gap-1 border border-blue-300 bg-blue-50 rounded px-2 py-1">
                    <span className="text-xs text-blue-800 truncate flex-1">{selectedClient.client_number} — {selectedClient.name}</span>
                    <button onClick={handleClearClient} className="text-blue-400 hover:text-blue-600 flex-shrink-0 leading-none">×</button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={e => handleClientSearchInput(e.target.value)}
                      onFocus={() => clientSearch.length >= 2 && setShowClientResults(true)}
                      onBlur={() => setTimeout(() => setShowClientResults(false), 150)}
                      placeholder="Search client…"
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {showClientResults && (clientResults.length > 0 || clientSearchLoading) && (
                      <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded shadow-lg z-20 max-h-40 overflow-y-auto">
                        {clientSearchLoading && <div className="px-2 py-1.5 text-xs text-gray-400">Searching…</div>}
                        {clientResults.map(c => (
                          <button
                            key={c.id}
                            onMouseDown={() => handleSelectClient(c)}
                            className="w-full text-left px-2 py-1.5 text-xs text-gray-800 hover:bg-blue-50 truncate"
                          >
                            {c.client_number} — {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              {/* Matter typeahead */}
              <div className="flex-1 min-w-0 relative">
                {selectedMatter ? (
                  <div className="flex items-center gap-1 border border-blue-300 bg-blue-50 rounded px-2 py-1">
                    <span className="text-xs text-blue-800 truncate flex-1">{selectedMatter.matter_number} — {selectedMatter.description}</span>
                    <button onClick={handleClearMatter} className="text-blue-400 hover:text-blue-600 flex-shrink-0 leading-none">×</button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={matterSearch}
                      onChange={e => handleMatterSearchInput(e.target.value)}
                      onFocus={() => matterSearch.length >= 2 && setShowMatterResults(true)}
                      onBlur={() => setTimeout(() => setShowMatterResults(false), 150)}
                      placeholder={selectedClient ? "Search matter…" : "Select client first"}
                      disabled={!selectedClient}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-50"
                    />
                    {showMatterResults && (matterResults.length > 0 || matterSearchLoading) && (
                      <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded shadow-lg z-20 max-h-40 overflow-y-auto">
                        {matterSearchLoading && <div className="px-2 py-1.5 text-xs text-gray-400">Searching…</div>}
                        {matterResults.map(m => (
                          <button
                            key={m.id}
                            onMouseDown={() => handleSelectMatter(m)}
                            className="w-full text-left px-2 py-1.5 text-xs text-gray-800 hover:bg-blue-50 truncate"
                          >
                            {m.matter_number} — {m.description}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
              {(["summarize", "ask", "chat"] as View[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  disabled={v === "chat" && !content}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    view === v ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {v === "summarize" ? "Summarize" : v === "ask" ? "Ask" : "Follow-up"}
                </button>
              ))}
            </div>

            {/* ── Summarize view ── */}
            {view === "summarize" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Buttons */}
                {!isStreaming && (
                  <div className="p-3 space-y-2 flex-shrink-0">
                    <button
                      onClick={() => handleSummarize(false)} disabled={!officeReady || matterRequired}
                      className="w-full bg-blue-600 text-white py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Summarize Document
                    </button>
                    <button
                      onClick={() => handleSummarize(true)} disabled={!officeReady || matterRequired}
                      className="w-full bg-white border border-gray-300 text-gray-700 py-2 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Summarize Selection
                    </button>
                    {matterRequired && (
                      <p className="text-xs text-amber-600 text-center">Select a client and matter above to continue.</p>
                    )}
                    {!officeReady && !matterRequired && (
                      <p className="text-xs text-gray-400 text-center">Connecting to Word...</p>
                    )}
                  </div>
                )}

                {isStreaming && (
                  <div className="px-3 py-2 flex items-center gap-2 text-gray-400 text-xs flex-shrink-0">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                    <span>Analyzing...</span>
                  </div>
                )}

                {error && (
                  <div className="mx-3 mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5 flex-shrink-0">{error}</div>
                )}

                {/* Result */}
                {content && (
                  <div className="flex-1 overflow-y-auto px-3 pb-3">
                    <div className="prose prose-xs max-w-none text-xs prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700 prose-p:my-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{hasCitations ? main : content}</ReactMarkdown>
                      {isStreaming && <span className="inline-block w-1.5 h-3 bg-gray-400 animate-pulse ml-0.5" />}
                    </div>

                    {/* Citations */}
                    {hasCitations && !isStreaming && (
                      <div className="mt-3 border-t border-gray-200 pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Citations</span>
                        </div>
                        <div className="space-y-2">
                          {citations.map(c => (
                            <div key={c.num} className="bg-white rounded border border-gray-200 px-2 py-1.5">
                              <div className="flex items-start gap-1.5">
                                <span className="text-xs font-bold text-gray-400 font-mono flex-shrink-0">[{c.num}]</span>
                                {c.name && <span className="text-xs font-semibold text-gray-700">{c.name}</span>}
                              </div>
                              {c.description && <p className="text-xs text-gray-500 leading-snug pl-5 mt-0.5">{c.description}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Insert button */}
                    {!isStreaming && (
                      <div className="mt-3">
                        <button
                          onClick={() => insertIntoDocument(hasCitations ? main : content)}
                          disabled={!officeReady}
                          className="w-full bg-green-600 text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
                        >
                          Insert into Doc
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Ask view ── */}
            {view === "ask" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Prompt input */}
                <div className="p-3 space-y-2 flex-shrink-0 border-b border-gray-100">
                  {/* Quick-prompt buttons */}
                  <div className="flex gap-1.5">
                    {[
                      { label: "Rewrite", prompt: "Rewrite this in plain English and suggest improvements to formatting and clarity." },
                      { label: "Identify", prompt: "Identify any ambiguous language, gaps, or legal risks in this provision." },
                      { label: "Draft", prompt: "Draft alternative language that provides stronger protection for our client." },
                    ].map(({ label, prompt }) => (
                      <button
                        key={label}
                        onClick={() => setAskPrompt(prompt)}
                        disabled={askStreaming}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    value={askPrompt}
                    onChange={e => setAskPrompt(e.target.value)}
                    placeholder="What would you like to know or do? e.g. &quot;What are the risks in this clause?&quot; or &quot;Suggest improvements to this paragraph.&quot;"
                    disabled={askStreaming}
                    title="Tip: Press Win + H to dictate using Windows Voice Typing"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAsk(true)}
                      disabled={!officeReady || !askPrompt.trim() || askStreaming || matterRequired}
                      className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Ask about Selection
                    </button>
                    <button
                      onClick={() => handleAsk(false)}
                      disabled={!officeReady || !askPrompt.trim() || askStreaming || matterRequired}
                      className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Ask about Document
                    </button>
                  </div>
                  {matterRequired && (
                    <p className="text-xs text-amber-600 text-center">Select a client and matter above to continue.</p>
                  )}
                  {!officeReady && !matterRequired && (
                    <p className="text-xs text-gray-400 text-center">Connecting to Word...</p>
                  )}
                </div>

                {/* Result area */}
                <div className="flex-1 overflow-y-auto">
                  {askStreaming && (
                    <div className="px-3 py-2 flex items-center gap-2 text-gray-400 text-xs">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                      <span>Analyzing...</span>
                    </div>
                  )}

                  {askError && (
                    <div className="mx-3 mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{askError}</div>
                  )}

                  {askContent && (
                    <div className="px-3 pb-3 pt-2">
                      <div className="prose prose-xs max-w-none text-xs prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700 prose-p:my-1">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{askHasCitations ? askMain : askContent}</ReactMarkdown>
                        {askStreaming && <span className="inline-block w-1.5 h-3 bg-gray-400 animate-pulse ml-0.5" />}
                      </div>

                      {askHasCitations && !askStreaming && (
                        <div className="mt-3 border-t border-gray-200 pt-3">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Citations</span>
                          <div className="space-y-2 mt-2">
                            {askCitations.map(c => (
                              <div key={c.num} className="bg-white rounded border border-gray-200 px-2 py-1.5">
                                <div className="flex items-start gap-1.5">
                                  <span className="text-xs font-bold text-gray-400 font-mono flex-shrink-0">[{c.num}]</span>
                                  {c.name && <span className="text-xs font-semibold text-gray-700">{c.name}</span>}
                                </div>
                                {c.description && <p className="text-xs text-gray-500 leading-snug pl-5 mt-0.5">{c.description}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {!askStreaming && (
                        <div className="mt-3">
                          <button
                            onClick={() => insertIntoDocument(askHasCitations ? askMain : askContent)}
                            disabled={!officeReady}
                            className="w-full bg-green-600 text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
                          >
                            Insert into Doc
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {!askContent && !askStreaming && !askError && (
                    <p className="text-xs text-gray-400 text-center mt-6 px-4">Type a request above and click a button to get recommendations.</p>
                  )}
                </div>
              </div>
            )}

            {/* ── Chat view ── */}
            {view === "chat" && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {messages.length === 0 && (
                    <p className="text-xs text-gray-400 text-center mt-6">Ask a follow-up question about the summary.</p>
                  )}
                  {messages.map((msg, i) => {
                    const isLast = chatStreaming && i === messages.length - 1;
                    const { main: msgMain, citations: msgCitations } = msg.role === "assistant"
                      ? parseContentAndCitations(msg.content)
                      : { main: msg.content, citations: [] };
                    const msgHasCitations = msgCitations.length > 0;

                    return (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[92%] rounded-xl px-3 py-2 text-xs ${
                          msg.role === "user" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-800"
                        }`}>
                          {msg.role === "assistant" ? (
                            <>
                              <div className="prose prose-xs max-w-none prose-p:my-0.5 prose-p:text-gray-800">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msgHasCitations ? msgMain : msg.content}</ReactMarkdown>
                                {isLast && <span className="inline-block w-1 h-3 bg-gray-400 animate-pulse ml-0.5" />}
                              </div>
                              {msgHasCitations && !isLast && (
                                <div className="mt-2 pt-2 border-t border-gray-200">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Citations</span>
                                  </div>
                                  <div className="space-y-1.5">
                                    {msgCitations.map(c => (
                                      <div key={c.num} className="bg-gray-50 rounded border border-gray-200 px-2 py-1">
                                        <div className="flex items-start gap-1">
                                          <span className="text-xs font-bold text-gray-400 font-mono flex-shrink-0">[{c.num}]</span>
                                          {c.name && <span className="text-xs font-semibold text-gray-700">{c.name}</span>}
                                        </div>
                                        {c.description && <p className="text-xs text-gray-500 pl-4 mt-0.5">{c.description}</p>}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          ) : msg.content}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleChat} className="flex items-end border-t border-gray-200 bg-white flex-shrink-0">
                  <textarea
                    rows={2} value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChat(e as unknown as FormEvent); } }}
                    placeholder="Ask a follow-up question..."
                    disabled={chatStreaming}
                    className="flex-1 px-3 py-2 text-xs text-gray-900 focus:outline-none disabled:opacity-50 resize-none"
                  />
                  <button
                    type="submit" disabled={!chatInput.trim() || chatStreaming}
                    className="px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-30 self-end"
                  >Send</button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
