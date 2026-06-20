"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { useSessionState } from "@/lib/useSessionState";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import FileDropZone from "@/components/FileDropZone";
import FileList from "@/components/FileList";
import ClientMatterSelect from "@/components/ClientMatterSelect";
import EdgarButton from "@/components/EdgarButton";
import CourtListenerButton from "@/components/CourtListenerButton";
import { parseContentAndCitations } from "@/lib/citations";
import { ASSIST_EXTENSIONS } from "@/lib/constants";
import type { Client, Matter } from "@/types";
import type { EdgarFiling } from "@/components/EdgarBrowser";
import type { CourtListenerOpinion } from "@/components/CourtListenerBrowser";

async function downloadPdf(markdown: string, clientMatter: { clientName: string; clientNumber: string; matterDescription: string; matterNumber: string } | null) {
  const res = await fetch("/api/export-assist-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown, clientMatter }),
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "conversation-assist.pdf";
  a.click();
  URL.revokeObjectURL(url);
}

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
}

interface ApiMessage {
  role: "user" | "assistant";
  content: string;
}

export default function AssistPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== "admin" && !user.pages.includes("assist")) {
      router.replace("/");
    }
  }, [user, router]);

  const [displayMessages, setDisplayMessages] = useSessionState<DisplayMessage[]>("assist:displayMessages", []);
  const [apiHistory, setApiHistory] = useSessionState<ApiMessage[]>("assist:apiHistory", []);
  const [selectedClient, setSelectedClient] = useSessionState<Client | null>("assist:selectedClient", null);
  const [selectedMatter, setSelectedMatter] = useSessionState<Matter | null>("assist:selectedMatter", null);
  const [files, setFiles] = useState<File[]>([]);
  const [edgarFilings, setEdgarFilings] = useState<EdgarFiling[]>([]);
  const [courtOpinions, setCourtOpinions] = useState<CourtListenerOpinion[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasMessages = displayMessages.length > 0;
  const canSubmit = !!input.trim() && !isStreaming && !!selectedClient && !!selectedMatter;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages]);

  useEffect(() => {
    if (!isStreaming && hasMessages) {
      inputRef.current?.focus();
    }
  }, [isStreaming, hasMessages]);

  const handleFiles = useCallback((newFiles: File[]) => {
    if (hasMessages) return; // lock files after conversation starts
    setFiles(prev => [...prev, ...newFiles]);
  }, [hasMessages]);

  const handleRemoveFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleEdgarAdd = useCallback((filing: EdgarFiling) => {
    if (hasMessages) return;
    setEdgarFilings(prev => prev.find(f => f.accessionNo === filing.accessionNo) ? prev : [...prev, filing]);
  }, [hasMessages]);

  const handleEdgarRemove = useCallback((accessionNo: string) => {
    setEdgarFilings(prev => prev.filter(f => f.accessionNo !== accessionNo));
  }, []);

  const handleCourtAdd = useCallback((opinion: CourtListenerOpinion) => {
    if (hasMessages) return;
    setCourtOpinions(prev => prev.find(o => o.clusterId === opinion.clusterId) ? prev : [...prev, opinion]);
  }, [hasMessages]);

  const handleCourtRemove = useCallback((clusterId: number) => {
    setCourtOpinions(prev => prev.filter(o => o.clusterId !== clusterId));
  }, []);

  const handleClientMatterSelect = useCallback((client: Client, matter: Matter) => {
    setSelectedClient(client);
    setSelectedMatter(matter);
  }, []);

  const handleClientMatterClear = useCallback(() => {
    setSelectedClient(null);
    setSelectedMatter(null);
  }, []);

  const handleNewConversation = useCallback(() => {
    setDisplayMessages([]);
    setApiHistory([]);
    setFiles([]);
    setEdgarFilings([]);
    setCourtOpinions([]);
    setInput("");
    setError(null);
  }, []);

  const handleSubmit = useCallback(async (e: FormEvent | null, promptOverride?: string) => {
    if (e) e.preventDefault();
    const prompt = (promptOverride ?? input).trim();
    if (!prompt || isStreaming || !selectedClient || !selectedMatter) return;

    setInput("");
    setError(null);
    setDisplayMessages(prev => [...prev, { role: "user", content: prompt }]);
    setIsStreaming(true);

    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("clientId", String(selectedClient.id));
    formData.append("matterId", String(selectedMatter.id));

    // Only send files and research sources on the first message
    if (apiHistory.length === 0) {
      files.forEach(f => formData.append("files", f));
      if (edgarFilings.length > 0) {
        formData.append("edgarFilings", JSON.stringify(edgarFilings));
      }
      if (courtOpinions.length > 0) {
        formData.append("courtlistenerOpinions", JSON.stringify(courtOpinions));
      }
    }

    if (apiHistory.length > 0) {
      formData.append("messages", JSON.stringify(apiHistory));
    }

    let fullUserMessage = prompt;
    let assistantContent = "";

    try {
      const res = await fetch("/api/assist", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Request failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      setDisplayMessages(prev => [...prev, { role: "assistant", content: "" }]);

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
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.meta && parsed.userMessage) {
              fullUserMessage = parsed.userMessage;
            } else if (parsed.text) {
              assistantContent += parsed.text;
              const snapshot = assistantContent;
              setDisplayMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: snapshot };
                return updated;
              });
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== "Unexpected end of JSON input") {
              throw parseErr;
            }
          }
        }
      }

      // Store the full constructed user message so documents stay in history
      setApiHistory(prev => [
        ...prev,
        { role: "user", content: fullUserMessage },
        { role: "assistant", content: assistantContent },
      ]);
    } catch (err) {
      setDisplayMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.content) return prev.slice(0, -1);
        return prev;
      });
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, selectedClient, selectedMatter, files, edgarFilings, courtOpinions, apiHistory]);

  const QUICK_ACTIONS = [
    {
      label: "Summarize",
      prompt: "Please provide a comprehensive summary with key findings, structured sections, and inline citations for each referenced document.",
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
    },
    {
      label: "Key Dates",
      prompt: "Please extract all key dates from these documents, including deadlines, effective dates, expiration dates, and any other important dates. Present them in a structured list with inline citations [1], [2], etc. referencing the source document for each date.",
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
    },
    {
      label: "Identify Parties",
      prompt: "Please identify all parties in these documents, their roles, and their relationships to each other. Use inline citations [1], [2], etc. referencing the source document where each party is identified.",
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />,
    },
    {
      label: "List Obligations",
      prompt: "Please list all obligations and commitments for each party in these documents, structured by party. Use inline citations [1], [2], etc. referencing the source document for each obligation.",
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />,
    },
    {
      label: "Flag Risks",
      prompt: "Please identify any unusual clauses, missing provisions, or potential risks in these documents that warrant attention. Use inline citations [1], [2], etc. referencing the source document for each risk identified.",
      icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Assist</h1>
          <a href="/help#assist" title="Help" className="flex items-center justify-center w-6 h-6 rounded-full border border-gray-400 text-gray-500 hover:border-gray-600 hover:text-gray-700 transition-colors text-xs font-semibold">
            ?
          </a>
        </div>
        {hasMessages && (
          <button
            onClick={handleNewConversation}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            New Conversation
          </button>
        )}
      </div>
      <p className="text-gray-600 mb-6">
        Ask questions, analyze documents, or explore any topic with AI assistance.
      </p>

      {/* Client/Matter — selector before conversation, badge after */}
      {!hasMessages ? (
        <div className="mb-6">
          <ClientMatterSelect
            onSelect={handleClientMatterSelect}
            onClear={handleClientMatterClear}
            initialClient={selectedClient ?? undefined}
            initialMatter={selectedMatter ?? undefined}
          />
        </div>
      ) : selectedClient && selectedMatter && (
        <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
          <span className="font-medium text-gray-700">{selectedClient.name}</span>
          <span className="text-gray-300">/</span>
          <span>{selectedMatter.description}</span>
        </div>
      )}

      {/* Conversation thread */}
      {hasMessages && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <span className="text-xs text-gray-400">{displayMessages.length} message{displayMessages.length !== 1 ? "s" : ""}</span>
            <button
              onClick={() => {
                const markdown = displayMessages.map(m =>
                  `## ${m.role === "user" ? "You" : "Henry"}\n\n${m.content}`
                ).join("\n\n---\n\n");
                downloadPdf(markdown, selectedClient && selectedMatter ? {
                  clientName: selectedClient.name,
                  clientNumber: selectedClient.client_number,
                  matterDescription: selectedMatter.description,
                  matterNumber: selectedMatter.matter_number,
                } : null);
              }}
              className="inline-flex items-center gap-1.5 bg-gray-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-900 transition-colors"
            >
              Download Conversation
            </button>
          </div>
          <div className="max-h-[600px] overflow-y-auto p-4 space-y-4">
            {displayMessages.map((msg, i) => {
              const isLastStreaming = isStreaming && i === displayMessages.length - 1;
              const { main, citations } = msg.role === "assistant"
                ? parseContentAndCitations(msg.content)
                : { main: msg.content, citations: [] };
              const hasCitations = citations.length > 0;

              return (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <>
                        <div className="prose prose-xl max-w-none prose-p:text-gray-800 prose-p:my-1 prose-headings:text-gray-900 prose-li:text-gray-800 leading-[1.98]">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{ img: () => null }}
                          >
                            {hasCitations ? main : msg.content}
                          </ReactMarkdown>
                          {isLastStreaming && (
                            <span className="inline-block w-1.5 h-3.5 bg-gray-400 animate-pulse ml-0.5" />
                          )}
                        </div>

                        {hasCitations && !isLastStreaming && (
                          <div className="mt-3 border-t border-gray-200 pt-3">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Citations</span>
                            <div className="mt-2 space-y-2">
                              {citations.map((c) => (
                                <div key={c.num} className="bg-white rounded-lg px-3 py-2 border border-gray-200">
                                  <div className="flex items-start gap-1.5 mb-0.5">
                                    <span className="text-xs font-bold text-gray-400 font-mono flex-shrink-0">[{c.num}]</span>
                                    {c.name && <span className="text-xs font-semibold text-gray-700">{c.name}</span>}
                                  </div>
                                  {c.description && (
                                    <p className="text-xs text-gray-500 leading-snug pl-5">{c.description}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {!isLastStreaming && (
                          <button
                            onClick={() => downloadPdf(msg.content, selectedClient && selectedMatter ? {
                              clientName: selectedClient.name,
                              clientNumber: selectedClient.client_number,
                              matterDescription: selectedMatter.description,
                              matterNumber: selectedMatter.matter_number,
                            } : null)}
                            className="mt-3 inline-flex items-center gap-1.5 bg-gray-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-900 transition-colors"
                          >
                            Download PDF
                          </button>
                        )}
                      </>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Input area */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* File upload — top of card, locked once conversation starts */}
        {!hasMessages && (
          <div className="px-4 py-3 space-y-2 border-b border-gray-100">
            <FileDropZone onFiles={handleFiles} accept={ASSIST_EXTENSIONS.join(",")} />
            <FileList files={files} onRemove={handleRemoveFile} />
            {files.length === 0 && edgarFilings.length === 0 && (
              <p className="text-xs text-gray-400">
                Documents and images are optional — you can ask questions without uploading anything.
              </p>
            )}
          </div>
        )}

        {/* Research Sources — locked once conversation starts */}
        {!hasMessages && (
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center flex-wrap gap-2">
              <p className="text-xs text-gray-500 font-medium mr-1">Research Sources</p>
              <EdgarButton onAdd={handleEdgarAdd} alreadyAdded={edgarFilings.map(f => f.accessionNo)} />
              <CourtListenerButton onAdd={handleCourtAdd} alreadyAdded={courtOpinions.map(o => String(o.clusterId))} />
            </div>
            {(edgarFilings.length > 0 || courtOpinions.length > 0) && (
              <ul className="mt-2 space-y-1.5">
                {edgarFilings.map(f => (
                  <li key={f.accessionNo} className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-blue-900 truncate block">{f.company}</span>
                      <span className="text-xs text-blue-600">SEC EDGAR · {f.formType} · Filed {f.filingDate}</span>
                    </div>
                    <button onClick={() => handleEdgarRemove(f.accessionNo)} className="text-blue-400 hover:text-blue-700 text-lg leading-none flex-shrink-0">&times;</button>
                  </li>
                ))}
                {courtOpinions.map(o => (
                  <li key={o.clusterId} className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-blue-900 truncate block">{o.caseName}</span>
                      <span className="text-xs text-blue-600">CourtListener{o.citation ? ` · ${o.citation}` : ""}{o.dateFiled ? ` · ${o.dateFiled}` : ""}</span>
                    </div>
                    <button onClick={() => handleCourtRemove(o.clusterId)} className="text-blue-400 hover:text-blue-700 text-lg leading-none flex-shrink-0">&times;</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Quick-action buttons — only when documents or research sources are loaded */}
        {!hasMessages && (files.length > 0 || edgarFilings.length > 0 || courtOpinions.length > 0) && (
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs text-gray-400 mb-2">Quick actions — click to run instantly</p>
            <div className="flex gap-2 flex-wrap">
              {QUICK_ACTIONS.map(({ label, prompt, icon }) => (
                <button
                  key={label}
                  type="button"
                  disabled={!selectedMatter || isStreaming}
                  onClick={() => handleSubmit(null, prompt)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-blue-200"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">{icon}</svg>
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={(e) => handleSubmit(e)} className="flex items-end">
          <textarea
            ref={inputRef}
            rows={4}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as FormEvent);
              }
            }}
            placeholder={
              !selectedMatter
                ? "Select a client and matter above, then ask anything..."
                : files.length > 0 && !hasMessages
                ? `Or type a custom question about your ${files.length} document${files.length !== 1 ? "s" : ""}...`
                : "Ask anything... (Shift+Enter for new line)"
            }
            disabled={isStreaming}
            className="flex-1 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed resize-none border border-gray-300 rounded-lg m-3"
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-3 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed self-end"
          >
            {isStreaming ? "..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
