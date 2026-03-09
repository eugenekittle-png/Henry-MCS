"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseContentAndCitations, citationsToMarkdown } from "@/lib/citations";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SummaryChatProps {
  summaryContent: string;
  documentNames: string[];
}

async function downloadMarkdown(markdown: string, filename: string) {
  const res = await fetch("/api/export-docx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown }),
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SummaryChat({ summaryContent, documentNames }: SummaryChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || isStreaming) return;

    setInput("");
    const userMsg: ChatMessage = { role: "user", content: question };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);

    const contextMessage = `Here is the summary that was generated from the following documents: ${documentNames.join(", ")}\n\n---\n\n${summaryContent}`;
    const apiMessages = [
      { role: "user" as const, content: contextMessage },
      { role: "assistant" as const, content: "I've reviewed the summary. What questions do you have?" },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: question },
    ];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Request failed");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

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
              const snapshot = assistantContent;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: snapshot };
                return updated;
              });
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev.slice(0, -1).filter((m) => m.content !== ""),
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setIsStreaming(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-700">Follow-up Questions</h3>
        <p className="text-xs text-gray-500">Ask questions about the summary above</p>
      </div>

      {messages.length > 0 && (
        <div className="max-h-[600px] overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => {
            const isLastStreaming = isStreaming && i === messages.length - 1;
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
                      {/* Main response content */}
                      <div className="prose prose-sm max-w-none prose-p:text-gray-800 prose-p:my-1 prose-headings:text-gray-900 prose-li:text-gray-800">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {hasCitations ? main : msg.content}
                        </ReactMarkdown>
                        {isLastStreaming && (
                          <span className="inline-block w-1.5 h-3.5 bg-gray-400 animate-pulse ml-0.5" />
                        )}
                      </div>

                      {/* Citations section — shown once streaming is done */}
                      {hasCitations && !isLastStreaming && (
                        <div className="mt-3 border-t border-gray-200 pt-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                              Citations
                            </span>
                            <button
                              onClick={() => downloadMarkdown(citationsToMarkdown(citations), "citations.pdf")}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-gray-800 hover:bg-gray-900 px-2 py-1 rounded-lg transition-colors"
                            >
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Download
                            </button>
                          </div>
                          <div className="space-y-2">
                            {citations.map((c) => (
                              <div key={c.num} className="bg-white rounded-lg px-3 py-2 border border-gray-200">
                                <div className="flex items-start gap-1.5 mb-0.5">
                                  <span className="text-xs font-bold text-gray-400 font-mono flex-shrink-0">[{c.num}]</span>
                                  {c.name && (
                                    <span className="text-xs font-semibold text-gray-700">{c.name}</span>
                                  )}
                                </div>
                                {c.description && (
                                  <p className="text-xs text-gray-500 leading-snug pl-5">{c.description}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Download response button */}
                      {msg.content && !isLastStreaming && (
                        <button
                          onClick={() => downloadMarkdown(main, "follow-up.pdf")}
                          className="mt-3 inline-flex items-center gap-1.5 bg-gray-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-900 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download Response
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
      )}

      <form onSubmit={handleSubmit} className="flex items-end border-t border-gray-200">
        <textarea
          ref={inputRef}
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as FormEvent);
            }
          }}
          placeholder="Ask a follow-up question..."
          disabled={isStreaming}
          className="flex-1 px-4 py-3 text-sm text-gray-900 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed resize-none"
        />
        <button
          type="submit"
          disabled={!input.trim() || isStreaming}
          className="px-4 py-3 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed self-end"
        >
          Send
        </button>
      </form>
    </div>
  );
}
