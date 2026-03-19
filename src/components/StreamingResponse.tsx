"use client";

import { useCallback, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseContentAndCitations, citationsToMarkdown } from "@/lib/citations";
import type { ParsedCitation } from "@/lib/citations";

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

  const handleDownloadAnalysis = useCallback(async () => {
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
    a.download = "analysis.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }, [content, clientMatter]);

  const { main, citations } = useMemo(() => parseContentAndCitations(content), [content]);
  const hasCitations = citations.length > 0;

  const handleDownloadCitations = useCallback(async () => {
    const markdown = citationsToMarkdown(citations);

    const res = await fetch("/api/export-docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown, clientMatter: clientMatter || undefined }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "citations.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }, [citations, clientMatter]);

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
    <div className="flex gap-4 items-start">
      {/* Main content */}
      <div
        ref={containerRef}
        className="flex-1 min-w-0 bg-gray-100 text-sm text-gray-800 rounded-xl p-6 max-h-[70vh] overflow-y-auto"
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
        <div className="prose prose-xl max-w-none font-sans prose-p:my-1 prose-headings:text-gray-900 prose-p:text-gray-800 prose-li:text-gray-800 prose-strong:text-gray-900 leading-[1.98]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{hasCitations ? main : content}</ReactMarkdown>
        </div>
        {isStreaming && content && (
          <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-0.5" />
        )}
        {!isStreaming && content && (
          <button
            onClick={handleDownloadAnalysis}
            className="mt-4 w-full bg-gray-800 text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-gray-900 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
        )}
      </div>

      {/* Citations right panel */}
      {hasCitations && (
        <div className="w-64 flex-shrink-0 bg-white border border-gray-200 rounded-xl overflow-hidden sticky top-4">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Citations
            </h3>
            <button
              onClick={handleDownloadCitations}
              title="Download citations"
              className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-gray-800 hover:bg-gray-900 px-2.5 py-1 rounded-lg transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-100">
            {citations.map((c) => (
              <div key={c.num} className="px-4 py-3">
                <div className="flex items-start gap-2 mb-1">
                  <span className="text-xs font-bold text-gray-400 font-mono flex-shrink-0 mt-px">
                    [{c.num}]
                  </span>
                  {c.name && (
                    <span className="text-xs font-semibold text-gray-800 leading-snug">
                      {c.name}
                    </span>
                  )}
                </div>
                {c.description && (
                  <p className="text-xs text-gray-600 leading-snug pl-6">
                    {c.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
