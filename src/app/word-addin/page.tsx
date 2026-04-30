"use client";

import { useState, useEffect, useRef, useCallback, FormEvent } from "react";
import Script from "next/script";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseContentAndCitations } from "@/lib/citations";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface User { username: string; role: string }
interface ChatMessage { role: "user" | "assistant"; content: string }
interface Suggestion { paragraphIndex: number; replacement: string; reason: string }


export default function WordAddinPage() {
  const [officeReady, setOfficeReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
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
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null);
  const [askContent, setAskContent] = useState("");
  const [askStreaming, setAskStreaming] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [askWasSelection, setAskWasSelection] = useState(true);

  // Ask follow-up state
  const [askFollowUpMessages, setAskFollowUpMessages] = useState<ChatMessage[]>([]);
  const [askFollowUpInput, setAskFollowUpInput] = useState("");
  const [askFollowUpStreaming, setAskFollowUpStreaming] = useState(false);

  // Suggest changes state
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestApplying, setSuggestApplying] = useState(false);
  const [suggestApplied, setSuggestApplied] = useState(false);

  const askFollowUpEndRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<string | null>(null);

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
    askFollowUpEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [askFollowUpMessages]);

  // Restore persisted client/matter on mount
  useEffect(() => {
    try {
      const client = localStorage.getItem("addin_selectedClient");
      const matter = localStorage.getItem("addin_selectedMatter");
      if (client) setSelectedClient(JSON.parse(client));
      if (matter) setSelectedMatter(JSON.parse(matter));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (selectedClient) localStorage.setItem("addin_selectedClient", JSON.stringify(selectedClient));
    else localStorage.removeItem("addin_selectedClient");
  }, [selectedClient]);

  useEffect(() => {
    if (selectedMatter) localStorage.setItem("addin_selectedMatter", JSON.stringify(selectedMatter));
    else localStorage.removeItem("addin_selectedMatter");
  }, [selectedMatter]);

  // When opened from context menu (action=ask), read the selection into the textarea
  useEffect(() => {
    if (!officeReady) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") !== "ask") return;
    (window as any).Word.run(async (context: any) => {
      const sel = context.document.getSelection();
      sel.load("text");
      await context.sync();
      const text = (sel.text as string).trim();
      if (text) setAskPrompt(text);
    }).catch(() => {});
  }, [officeReady]);


  function fetchTopClients() {
    setClientSearchLoading(true);
    const headers: HeadersInit = {};
    if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
    fetch(`/api/clients?limit=10`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(data => setClientResults(data))
      .catch(() => {})
      .finally(() => setClientSearchLoading(false));
  }

  function handleClientFocus() {
    setShowClientResults(true);
    if (clientSearch.length < 1 && clientResults.length === 0) fetchTopClients();
  }

  function handleClientSearchInput(value: string) {
    setClientSearch(value);
    setShowClientResults(true);
    clearTimeout(clientSearchTimer.current);
    if (value.length < 1) { fetchTopClients(); return; }
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
    setMatterResults([]); // cleared so focus fetches top 10 for new client
  }

  function handleClearClient() {
    setSelectedClient(null);
    setClientSearch("");
    setClientResults([]);
    setSelectedMatter(null);
    setMatterSearch("");
    setMatterResults([]);
  }

  function fetchTopMatters(clientId: number) {
    setMatterSearchLoading(true);
    const headers: HeadersInit = {};
    if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
    fetch(`/api/clients/${clientId}/matters?limit=10`, { headers })
      .then(r => r.ok ? r.json() : [])
      .then(data => setMatterResults(data))
      .catch(() => {})
      .finally(() => setMatterSearchLoading(false));
  }

  function handleMatterFocus() {
    if (!selectedClient) return;
    setShowMatterResults(true);
    if (matterSearch.length < 1 && matterResults.length === 0) fetchTopMatters(selectedClient.id);
  }

  function handleMatterSearchInput(value: string) {
    setMatterSearch(value);
    setShowMatterResults(true);
    clearTimeout(matterSearchTimer.current);
    if (value.length < 1) { if (selectedClient) fetchTopMatters(selectedClient.id); return; }
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

  function handleRefresh() {
    setAskContent("");
    setAskError(null);
    setAskPrompt("");
    setActiveQuickAction(null);
    setAskFollowUpMessages([]);
    setAskFollowUpInput("");
    setSelectedClient(null);
    setSelectedMatter(null);
    setClientSearch("");
    setMatterSearch("");
    setSuggestions(null);
    setSuggestError(null);
    setSuggestLoading(false);
    setSuggestApplied(false);
  }

  function clearSuggestMode() {
    setSuggestions(null);
    setSuggestError(null);
    setSuggestLoading(false);
    setSuggestApplied(false);
  }

  async function getDocumentText(selectionOnly: boolean): Promise<string> {
    return (window as any).Word.run(async (context: any) => {
      const range = selectionOnly ? context.document.getSelection() : context.document.body;
      range.load("text");
      await context.sync();
      return range.text as string;
    });
  }

  async function getDocumentParagraphs(): Promise<string[]> {
    return (window as any).Word.run(async (context: any) => {
      const paragraphs = context.document.body.paragraphs;
      paragraphs.load("text");
      await context.sync();
      return paragraphs.items.map((p: any) => p.text as string);
    });
  }

  async function handleSuggestChanges() {
    if (!officeReady) return;
    // Clear ask mode
    setAskContent("");
    setAskError(null);
    setActiveQuickAction(null);
    setAskFollowUpMessages([]);
    setAskFollowUpInput("");
    // Reset suggest state
    setSuggestions(null);
    setSuggestError(null);
    setSuggestApplied(false);
    setSuggestLoading(true);

    let paragraphs: string[];
    try {
      paragraphs = await getDocumentParagraphs();
    } catch {
      setSuggestError("Could not read the document. Make sure a Word document is open.");
      setSuggestLoading(false);
      return;
    }

    const nonEmpty = paragraphs.filter(p => p.trim().length > 0);
    if (nonEmpty.length === 0) {
      setSuggestError("The document appears to be empty.");
      setSuggestLoading(false);
      return;
    }

    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      const res = await fetch("/api/addin/suggest", {
        method: "POST",
        headers,
        body: JSON.stringify({
          paragraphs,
          client: clientLabel,
          matter: matterLabel,
          clientNumber: selectedClient?.client_number ?? null,
          matterNumber: selectedMatter?.matter_number ?? null,
        }),
      });
      if (!res.ok) {
        let errMsg = `Request failed (${res.status})`;
        try { const d = await res.json(); if (d.error) errMsg = d.error; } catch { /* non-JSON */ }
        throw new Error(errMsg);
      }
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSuggestLoading(false);
    }
  }

  async function handleApplySuggestions(withComments: boolean) {
    if (!officeReady || !suggestions || suggestions.length === 0) return;
    setSuggestApplying(true);
    setSuggestError(null);
    try {
      await (window as any).Word.run(async (context: any) => {
        const body = context.document.body;
        const paragraphs = body.paragraphs;
        paragraphs.load("text");
        await context.sync();

        // Phase 1: enable track changes using string literal (enum ref unreliable at runtime)
        try {
          context.document.changeTrackingMode = "TrackAll";
          await context.sync();
        } catch { /* not supported in this version — changes will still apply without tracking */ }

        // Apply replacements in reverse order to preserve paragraph indices
        const sorted = [...suggestions].sort((a, b) => b.paragraphIndex - a.paragraphIndex);
        for (const s of sorted) {
          if (s.paragraphIndex < paragraphs.items.length) {
            paragraphs.items[s.paragraphIndex].insertText(s.replacement, "Replace");
          }
        }
        await context.sync();

        // Disable track changes
        try {
          context.document.changeTrackingMode = "Off";
          await context.sync();
        } catch { /* ignore */ }

        // Phase 2: attach comments after changes are committed
        if (withComments) {
          const paragraphs2 = body.paragraphs;
          paragraphs2.load("text");
          await context.sync();
          for (const s of suggestions) {
            if (s.paragraphIndex < paragraphs2.items.length) {
              try {
                paragraphs2.items[s.paragraphIndex].getRange().insertComment(s.reason);
              } catch { /* skip paragraphs that don't support comments */ }
            }
          }
          await context.sync();
        }
      });
      setSuggestApplied(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSuggestError(msg);
    } finally {
      setSuggestApplying(false);
    }
  }

  async function insertIntoDocument(text: string) {
    await (window as any).Word.run(async (context: any) => {
      const selection = context.document.getSelection();
      selection.insertText("\n\n" + text, "After");
      await context.sync();
    });
  }

  const handleAsk = useCallback(async (selectionOnly: boolean, promptOverride?: string) => {
    const effectivePrompt = promptOverride ?? askPrompt;
    if (!officeReady || !effectivePrompt.trim()) return;
    setAskWasSelection(selectionOnly);
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
        body: JSON.stringify({
          text: docText,
          prompt: effectivePrompt.trim(),
          client: clientLabel,
          matter: matterLabel,
          clientNumber: selectedClient?.client_number ?? null,
          matterNumber: selectedMatter?.matter_number ?? null,
        }),
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

  const handleQuickAction = useCallback(async (label: string, prompt: string) => {
    if (!officeReady) return;
    setActiveQuickAction(label);
    let selectedText = "";
    try {
      selectedText = await getDocumentText(true);
    } catch { /* ignore */ }
    const combined = selectedText.trim()
      ? `${prompt}\n\n${selectedText.trim()}`
      : prompt;
    setAskPrompt(combined);
    handleAsk(true, combined);
  }, [officeReady, handleAsk]);

  function extractCleanVersion(text: string): string {
    // Find the "Clean Rewritten Version" heading and take everything after it
    const match = text.match(/^#{1,6}\s*.*?\bclean\b.*?(?:version|rewrite|rewritten)\b.*$/im);
    if (match && match.index !== undefined) {
      text = text.slice(match.index + match[0].length).trim();
    }
    // Strip markdown formatting for plain text insertion
    return text
      .replace(/~~[^~]*~~/g, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  async function replaceSelection(text: string) {
    const clean = extractCleanVersion(text);
    await (window as any).Word.run(async (context: any) => {
      const selection = context.document.getSelection();
      selection.insertText(clean, "Replace");
      await context.sync();
    });
  }

  async function handleAskFollowUp(e: FormEvent) {
    e.preventDefault();
    const question = askFollowUpInput.trim();
    if (!question || askFollowUpStreaming) return;

    setAskFollowUpInput("");
    const { main: askResultMain } = parseContentAndCitations(askContent);
    const apiMessages = [
      { role: "user" as const, content: `Here is the AI response to my request:\n\n${askResultMain}` },
      { role: "assistant" as const, content: "I've reviewed my response. What follow-up questions do you have?" },
      ...askFollowUpMessages.map(m => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: question },
    ];

    setAskFollowUpMessages(prev => [...prev, { role: "user", content: question }]);
    setAskFollowUpStreaming(true);

    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (tokenRef.current) headers["Authorization"] = `Bearer ${tokenRef.current}`;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: apiMessages,
          source: "word-addin",
          clientNumber: selectedClient?.client_number ?? null,
          matterNumber: selectedMatter?.matter_number ?? null,
        }),
      });
      if (!res.ok) { let m = `Failed (${res.status})`; try { const d = await res.json(); if (d.error) m = d.error; } catch { /* non-JSON */ } throw new Error(m); }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";

      setAskFollowUpMessages(prev => [...prev, { role: "assistant", content: "" }]);

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
              setAskFollowUpMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: snap };
                return updated;
              });
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setAskFollowUpMessages(prev => [...prev.slice(0, -1), { role: "assistant", content: "Sorry, something went wrong." }]);
    } finally {
      setAskFollowUpStreaming(false);
    }
  }

  const clientLabel = selectedClient ? `${selectedClient.client_number} — ${selectedClient.name}` : "";
  const matterLabel = selectedMatter ? `${selectedMatter.matter_number} — ${selectedMatter.description}` : "";
  const matterRequired = !selectedClient || !selectedMatter;

  const { main: askMain, citations: askCitations } = parseContentAndCitations(askContent);
  const askHasCitations = askCitations.length > 0;
  const suggestActive = suggestLoading || suggestError !== null || suggestions !== null;

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

            {/* Client / Matter context */}
            <div className="flex flex-col gap-1.5 px-3 py-2 bg-white border-b border-gray-100 flex-shrink-0">
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
                      onFocus={handleClientFocus}
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
                      onFocus={handleMatterFocus}
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

            {/* ── Ask / Suggest view ── */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header — collapsed when a response or suggest result is showing */}
                {(askContent || askStreaming || suggestActive) ? (
                  <div className="px-3 py-2 flex items-center gap-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
                    {suggestActive ? (
                      <>
                        <p className="flex-1 text-xs text-gray-500 font-medium">Suggest Changes</p>
                        {!suggestApplied && suggestions && suggestions.length > 0 && (
                          <>
                            <button
                              onClick={() => handleApplySuggestions(false)}
                              disabled={!officeReady || suggestApplying}
                              className="text-xs bg-blue-600 text-white px-2 py-1 rounded font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                            >
                              Add All
                            </button>
                            <button
                              onClick={() => handleApplySuggestions(true)}
                              disabled={!officeReady || suggestApplying}
                              className="text-xs bg-green-600 text-white px-2 py-1 rounded font-medium hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                            >
                              Add All with Comments
                            </button>
                          </>
                        )}
                        <button
                          onClick={clearSuggestMode}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                        >
                          New
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="flex-1 text-xs text-gray-500 truncate">{askPrompt || "—"}</p>
                        <button
                          onClick={() => {
                            setAskContent("");
                            setAskError(null);
                            setActiveQuickAction(null);
                            setAskFollowUpMessages([]);
                            setAskFollowUpInput("");
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                        >
                          New
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="p-3 space-y-2 flex-shrink-0 border-b border-gray-100">
                    {/* Quick-prompt buttons */}
                    <div className="flex gap-1.5">
                      {[
                        { label: "Suggest", prompt: "Review the following text and suggest improvements for clarity, grammar, tone, and structure. Provide the original with tracked changes noted, then a clean rewritten version." },
                        { label: "Identify", prompt: "Identify any ambiguous language, gaps, or legal risks in this provision. Note each issue inline, then provide a clean rewritten version that resolves all identified issues." },
                        { label: "Summarize", prompt: "Summarize the following text, highlighting the key provisions, parties, obligations, and important dates. Then provide a clean rewritten version as a concise executive summary." },
                      ].map(({ label, prompt }) => (
                        <button
                          key={label}
                          onClick={() => handleQuickAction(label, prompt)}
                          disabled={askStreaming}
                          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-1.5 rounded text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      rows={5}
                      value={askPrompt}
                      onChange={e => { setAskPrompt(e.target.value); setActiveQuickAction(null); }}
                      placeholder="What would you like to know or do? e.g. &quot;What are the risks in this clause?&quot; or &quot;Suggest improvements to this paragraph.&quot;"
                      disabled={askStreaming}
                      title="Tip: Press Win + H to dictate using Windows Voice Typing"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAsk(false)}
                        disabled={!officeReady || !askPrompt.trim() || askStreaming || matterRequired}
                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Ask
                      </button>
                      <button
                        onClick={() => handleAsk(true)}
                        disabled={!officeReady || !askPrompt.trim() || askStreaming || matterRequired}
                        className="flex-1 bg-white border border-gray-300 text-gray-700 py-2 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Ask about Selection
                      </button>
                    </div>
                    {/* Suggest Changes */}
                    <div className="border-t border-gray-100 pt-2">
                      <button
                        onClick={handleSuggestChanges}
                        disabled={!officeReady || matterRequired}
                        className="w-full bg-indigo-600 text-white py-2 rounded-lg text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Suggest Changes
                      </button>
                      <p className="text-xs text-gray-400 text-center mt-1">Applies AI suggestions as tracked changes in Word</p>
                    </div>
                    {matterRequired && (
                      <p className="text-xs text-amber-600 text-center">Select a client and matter above to continue.</p>
                    )}
                    {!officeReady && !matterRequired && (
                      <p className="text-xs text-gray-400 text-center">Connecting to Word...</p>
                    )}
                  </div>
                )}

                {/* Result area */}
                <div className="flex-1 overflow-y-auto">

                  {/* ── Suggest Changes result ── */}
                  {suggestActive && (
                    <div className="px-3 pb-3 pt-2">
                      {suggestLoading && (
                        <div className="flex items-center gap-2 text-gray-400 text-xs py-2">
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                          <span>Analyzing document...</span>
                        </div>
                      )}

                      {suggestError && (
                        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5 mb-2">{suggestError}</div>
                      )}

                      {suggestApplied && (
                        <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1.5 text-center mb-2">
                          Applied {suggestions?.length} tracked change{suggestions?.length !== 1 ? "s" : ""} to the document.
                        </div>
                      )}

                      {suggestApplying && (
                        <div className="text-xs text-indigo-600 text-center py-2">Applying changes...</div>
                      )}

                      {suggestions !== null && !suggestLoading && (
                        suggestions.length === 0 ? (
                          <p className="text-xs text-gray-500 text-center mt-4">No changes needed — the document looks good.</p>
                        ) : (
                          <div className="space-y-2 mt-1">
                            {suggestions.map((s, i) => (
                              <div key={i} className="bg-white border border-gray-200 rounded p-2">
                                <p className="text-xs text-indigo-700 font-medium mb-1">{s.reason}</p>
                                <p className="text-xs text-gray-600 leading-relaxed line-clamp-4">{s.replacement}</p>
                              </div>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {/* ── Ask result ── */}
                  {!suggestActive && askStreaming && (
                    <div className="px-3 py-2 flex items-center gap-2 text-gray-400 text-xs">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                      <span>Analyzing...</span>
                    </div>
                  )}

                  {!suggestActive && askError && (
                    <div className="mx-3 mt-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1.5">{askError}</div>
                  )}

                  {!suggestActive && askContent && (
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
                        <div className="mt-3 space-y-2">
                          <button
                            onClick={() => insertIntoDocument(askHasCitations ? askMain : askContent)}
                            disabled={!officeReady}
                            className="w-full bg-green-600 text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
                          >
                            Insert into Doc
                          </button>
                          <button
                            onClick={() => replaceSelection(askHasCitations ? askMain : askContent)}
                            disabled={!officeReady || !askWasSelection}
                            className="w-full bg-blue-600 text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Replace
                          </button>
                        </div>
                      )}

                      {/* Follow-up chat */}
                      {!askStreaming && (
                        <div className="mt-4 border-t border-gray-200 pt-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Follow-up</p>
                          <div className="space-y-2 mb-2">
                            {askFollowUpMessages.map((msg, i) => {
                              const isLast = askFollowUpStreaming && i === askFollowUpMessages.length - 1;
                              return (
                                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                  <div className={`max-w-[92%] rounded-xl px-3 py-2 text-xs ${
                                    msg.role === "user" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-800"
                                  }`}>
                                    {msg.role === "assistant" ? (
                                      <div className="prose prose-xs max-w-none prose-p:my-0.5 prose-p:text-gray-800">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                        {isLast && <span className="inline-block w-1 h-3 bg-gray-400 animate-pulse ml-0.5" />}
                                      </div>
                                    ) : msg.content}
                                  </div>
                                </div>
                              );
                            })}
                            <div ref={askFollowUpEndRef} />
                          </div>
                          <form onSubmit={handleAskFollowUp} className="flex items-end border border-gray-200 rounded-lg bg-white overflow-hidden">
                            <textarea
                              rows={3}
                              value={askFollowUpInput}
                              onChange={e => setAskFollowUpInput(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAskFollowUp(e as unknown as FormEvent); } }}
                              placeholder="Ask a follow-up question..."
                              disabled={askFollowUpStreaming}
                              className="flex-1 px-3 py-2 text-xs text-gray-900 focus:outline-none disabled:opacity-50 resize-none"
                            />
                            <button
                              type="submit" disabled={!askFollowUpInput.trim() || askFollowUpStreaming}
                              className="px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-30 self-end"
                            >Send</button>
                          </form>
                        </div>
                      )}
                    </div>
                  )}

                  {!suggestActive && !askContent && !askStreaming && !askError && (
                    <p className="text-xs text-gray-400 text-center mt-6 px-4">Type a request above and click a button to get recommendations.</p>
                  )}
                </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
