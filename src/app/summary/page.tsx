"use client";

import { useState, useCallback } from "react";
import FileDropZone from "@/components/FileDropZone";
import FileList from "@/components/FileList";
import StreamingResponse from "@/components/StreamingResponse";
import ClientMatterSelect from "@/components/ClientMatterSelect";
import type { Client, Matter } from "@/types";

export default function SummaryPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [content, setContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedMatter, setSelectedMatter] = useState<Matter | null>(null);

  const handleFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const handleRemove = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleClientMatterSelect = useCallback((client: Client, matter: Matter) => {
    setSelectedClient(client);
    setSelectedMatter(matter);
  }, []);

  const handleClientMatterClear = useCallback(() => {
    setSelectedClient(null);
    setSelectedMatter(null);
  }, []);

  const canSubmit = files.length > 0 && selectedClient && selectedMatter && !isStreaming;

  const handleSubmit = useCallback(async () => {
    if (!files.length || !selectedClient || !selectedMatter) return;

    setContent("");
    setError(null);
    setIsStreaming(true);

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    formData.append("clientId", String(selectedClient.id));
    formData.append("matterId", String(selectedMatter.id));

    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Request failed");
      }

      const reader = response.body?.getReader();
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
            if (parsed.error) {
              setError(parsed.error);
              setIsStreaming(false);
              return;
            }
            if (parsed.text) {
              setContent((prev) => prev + parsed.text);
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsStreaming(false);
    }
  }, [files, selectedClient, selectedMatter]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Document Summary</h1>
      <p className="text-gray-600 mb-6">
        Upload documents to get a comprehensive AI-generated summary.
      </p>

      <div className="space-y-4">
        <ClientMatterSelect
          onSelect={handleClientMatterSelect}
          onClear={handleClientMatterClear}
        />
        <FileDropZone onFiles={handleFiles} />
        <FileList files={files} onRemove={handleRemove} />

        {canSubmit && (
          <button
            onClick={handleSubmit}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            Summarize {files.length} document{files.length !== 1 ? "s" : ""}
          </button>
        )}

        {files.length > 0 && !selectedMatter && !isStreaming && (
          <p className="text-sm text-amber-600 text-center">
            Select a client and matter above before submitting.
          </p>
        )}

        {isStreaming && (
          <button
            disabled
            className="w-full bg-gray-400 text-white py-3 px-4 rounded-xl font-medium cursor-not-allowed"
          >
            Analyzing...
          </button>
        )}

        <StreamingResponse content={content} isStreaming={isStreaming} error={error} />
      </div>
    </div>
  );
}
