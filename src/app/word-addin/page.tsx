"use client";

import { useState, useEffect, useRef, useCallback, FormEvent } from "react";
import Script from "next/script";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseContentAndCitations, citationsToMarkdown } from "@/lib/citations";

/* eslint-disable @typescript-eslint/no-explicit-any */

type View = "summarize" | "chat";

interface User { username: string; role: string }
interface ChatMessage { role: "user" | "assistant"; content: string }

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for Office WebView2 where clipboard API may be unavailable
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
  document.body.appendChild(el);
  el.focus();
  el.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(el);
  if (!ok) throw new Error("Copy failed");
}

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

  const [copied, setCopied] = useState<string | null>(null);

  function handleCopy(text: string, key: string) {
    copyToClipboard(text)
      .then(() => {
        setCopied(key);
        setTimeout(() => setCopied(null), 1500);
      })
      .catch(() => {
        setCopied(`${key}-error`);
        setTimeout(() => setCopied(null), 2000);
      });
  }

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        body: JSON.stringify({ text: docText, filename: selectionOnly ? "Selection" : "Document" }),
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

  const { main, citations } = parseContentAndCitations(content);
  const hasCitations = citations.length > 0;

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
          {user && <span className="ml-auto text-gray-400 text-xs truncate max-w-[120px]">{user.username}</span>}
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

            {/* Tabs */}
            <div className="flex border-b border-gray-200 bg-white flex-shrink-0">
              {(["summarize", "chat"] as View[]).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  disabled={v === "chat" && !content}
                  className={`flex-1 py-2 text-xs font-medium transition-colors capitalize ${
                    view === v ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {v === "chat" ? "Follow-up" : "Summarize"}
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
                      onClick={() => handleSummarize(false)} disabled={!officeReady}
                      className="w-full bg-blue-600 text-white py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Summarize Document
                    </button>
                    <button
                      onClick={() => handleSummarize(true)} disabled={!officeReady}
                      className="w-full bg-white border border-gray-300 text-gray-700 py-2 rounded-lg text-xs font-semibold hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Summarize Selection
                    </button>
                    {!officeReady && (
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
                          <button
                            onClick={() => handleCopy(citationsToMarkdown(citations), "summary-citations")}
                            className="text-xs font-semibold text-white bg-gray-800 hover:bg-gray-900 px-2 py-0.5 rounded transition-colors"
                          >{copied === "summary-citations" ? "Copied!" : copied === "summary-citations-error" ? "Failed" : "Copy"}</button>
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

                    {/* Insert / Download buttons */}
                    {!isStreaming && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => insertIntoDocument(hasCitations ? main : content)}
                          disabled={!officeReady}
                          className="bg-green-600 text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
                        >
                          Insert into Doc
                        </button>
                        <button
                          onClick={() => handleCopy(hasCitations ? main : content, "summary")}
                          className="bg-gray-800 text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-900"
                        >
                          {copied === "summary" ? "Copied!" : copied === "summary-error" ? "Failed" : "Copy"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
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
                                    <button
                                      onClick={() => handleCopy(citationsToMarkdown(msgCitations), `chat-citations-${i}`)}
                                      className="text-xs font-semibold text-white bg-gray-800 hover:bg-gray-900 px-2 py-0.5 rounded transition-colors"
                                    >{copied === `chat-citations-${i}` ? "Copied!" : copied === `chat-citations-${i}-error` ? "Failed" : "Copy"}</button>
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
