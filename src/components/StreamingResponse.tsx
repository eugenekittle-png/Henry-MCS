"use client";

import { useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ClientMatterInfo {
  clientName: string;
  clientNumber: string;
  matterDescription: string;
  matterNumber: string;
}

interface StreamingResponseProps {
  content: string;
  isStreaming: boolean;
  error?: string | null;
  clientMatter?: ClientMatterInfo | null;
}

export default function StreamingResponse({
  content,
  isStreaming,
  error,
  clientMatter,
}: StreamingResponseProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDownload = useCallback(async () => {
    const res = await fetch("/api/export-docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown: content, clientMatter: clientMatter || undefined }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "analysis.docx";
    a.click();
    URL.revokeObjectURL(url);
  }, [content, clientMatter]);

  useEffect(() => {
    if (isStreaming && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [content, isStreaming]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <p className="text-red-700 font-medium">Error</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!content && !isStreaming) return null;

  return (
    <div
      ref={containerRef}
      className="bg-white border border-gray-200 rounded-xl p-6 max-h-[70vh] overflow-y-auto"
    >
      {isStreaming && !content && (
        <div className="flex items-center gap-2 text-gray-500">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
          </div>
          <span className="text-sm">Analyzing documents...</span>
        </div>
      )}
      <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
      {isStreaming && content && (
        <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-0.5" />
      )}
      {!isStreaming && content && (
        <button
          onClick={handleDownload}
          className="mt-4 w-full bg-gray-800 text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-gray-900 transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </button>
      )}
    </div>
  );
}
