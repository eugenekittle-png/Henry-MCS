"use client";

import { useState, useCallback } from "react";
import FileDropZone from "@/components/FileDropZone";
import FileList from "@/components/FileList";
import StreamingResponse from "@/components/StreamingResponse";
import ClientMatterSelect from "@/components/ClientMatterSelect";
import type { Client, Matter } from "@/types";

export default function ComparePage() {
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [content, setContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedMatter, setSelectedMatter] = useState<Matter | null>(null);

  const handleFile1 = useCallback((files: File[]) => {
    setFile1(files[0] || null);
  }, []);

  const handleFile2 = useCallback((files: File[]) => {
    setFile2(files[0] || null);
  }, []);

  const handleClientMatterSelect = useCallback((client: Client, matter: Matter) => {
    setSelectedClient(client);
    setSelectedMatter(matter);
  }, []);

  const handleClientMatterClear = useCallback(() => {
    setSelectedClient(null);
    setSelectedMatter(null);
  }, []);

  const canSubmit = file1 && file2 && selectedClient && selectedMatter && !isStreaming;

  const handleSubmit = useCallback(async () => {
    if (!file1 || !file2 || !selectedClient || !selectedMatter) return;

    setContent("");
    setError(null);
    setIsStreaming(true);

    const formData = new FormData();
    formData.append("file1", file1);
    formData.append("file2", file2);
    formData.append("clientId", String(selectedClient.id));
    formData.append("matterId", String(selectedMatter.id));

    try {
      const response = await fetch("/api/compare", {
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
  }, [file1, file2, selectedClient, selectedMatter]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Document Compare</h1>
      <p className="text-gray-600 mb-6">
        Upload two documents to get a detailed AI-generated comparison.
      </p>

      <div className="space-y-4">
        <ClientMatterSelect
          onSelect={handleClientMatterSelect}
          onClear={handleClientMatterClear}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Document 1</p>
            <FileDropZone
              onFiles={handleFile1}
              accept=".pdf,.doc,.docx"
              multiple={false}
              label="Drop first file here"
            />
            {file1 && (
              <FileList files={[file1]} onRemove={() => setFile1(null)} />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Document 2</p>
            <FileDropZone
              onFiles={handleFile2}
              accept=".pdf,.doc,.docx"
              multiple={false}
              label="Drop second file here"
            />
            {file2 && (
              <FileList files={[file2]} onRemove={() => setFile2(null)} />
            )}
          </div>
        </div>

        {canSubmit && (
          <button
            onClick={handleSubmit}
            className="w-full bg-purple-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-purple-700 transition-colors"
          >
            Compare Documents
          </button>
        )}

        {file1 && file2 && !selectedMatter && !isStreaming && (
          <p className="text-sm text-amber-600 text-center">
            Select a client and matter above before submitting.
          </p>
        )}

        {isStreaming && (
          <button
            disabled
            className="w-full bg-gray-400 text-white py-3 px-4 rounded-xl font-medium cursor-not-allowed"
          >
            Comparing...
          </button>
        )}

        <StreamingResponse
          content={content}
          isStreaming={isStreaming}
          error={error}
          clientMatter={selectedClient && selectedMatter ? {
            clientName: selectedClient.name,
            clientNumber: selectedClient.client_number,
            matterDescription: selectedMatter.description,
            matterNumber: selectedMatter.matter_number,
          } : null}
        />
      </div>
    </div>
  );
}
