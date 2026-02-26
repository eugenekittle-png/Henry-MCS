"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface StreamingResponseProps {
  content: string;
  isStreaming: boolean;
  error?: string | null;
}

export default function StreamingResponse({
  content,
  isStreaming,
  error,
}: StreamingResponseProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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
    </div>
  );
}
