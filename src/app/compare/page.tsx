"use client";

import { useState, useCallback } from "react";
import FileDropZone from "@/components/FileDropZone";
import FileList from "@/components/FileList";
import StreamingResponse from "@/components/StreamingResponse";
import ClientMatterSelect from "@/components/ClientMatterSelect";
import DiffDisplay from "@/components/DiffDisplay";
import type { DiffLine } from "@/components/DiffDisplay";
import type { Client, Matter } from "@/types";

export default function ComparePage() {
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [includeSummary, setIncludeSummary] = useState(false);
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const [diffFile1Name, setDiffFile1Name] = useState("");
  const [diffFile2Name, setDiffFile2Name] = useState("");
  const [summaryContent, setSummaryContent] = useState("");
  const [isComparing, setIsComparing] = useState(false);
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

  const isBusy = isComparing || isStreaming;
  const canSubmit = file1 && file2 && selectedClient && selectedMatter && !isBusy;

  const streamSummary = useCallback(async (formData: FormData) => {
    setIsStreaming(true);
    try {
      const response = await fetch("/api/compare", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Summary request failed");
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
              return;
            }
            if (parsed.text) {
              setSummaryContent((prev) => prev + parsed.text);
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
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!file1 || !file2 || !selectedClient || !selectedMatter) return;

    setDiffLines([]);
    setSummaryContent("");
    setError(null);
    setIsComparing(true);

    const formData = new FormData();
    formData.append("file1", file1);
    formData.append("file2", file2);
    formData.append("clientId", String(selectedClient.id));
    formData.append("matterId", String(selectedMatter.id));

    try {
      // Step 1: Get line-by-line diff
      const diffRes = await fetch("/api/compare-diff", {
        method: "POST",
        body: formData,
      });

      if (!diffRes.ok) {
        const data = await diffRes.json();
        throw new Error(data.error || "Diff request failed");
      }

      const diffData = await diffRes.json();
      setDiffLines(diffData.lines);
      setDiffFile1Name(diffData.file1Name);
      setDiffFile2Name(diffData.file2Name);
      setIsComparing(false);

      // Step 2: If summary requested, stream AI comparison
      if (includeSummary) {
        const summaryFormData = new FormData();
        summaryFormData.append("file1", file1);
        summaryFormData.append("file2", file2);
        summaryFormData.append("clientId", String(selectedClient.id));
        summaryFormData.append("matterId", String(selectedMatter.id));
        await streamSummary(summaryFormData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsComparing(false);
    }
  }, [file1, file2, selectedClient, selectedMatter, includeSummary, streamSummary]);

  const handleDownload = useCallback(async () => {
    const res = await fetch("/api/export-docx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        diff: { lines: diffLines, file1Name: diffFile1Name, file2Name: diffFile2Name },
        markdown: summaryContent || undefined,
        clientMatter: selectedClient && selectedMatter ? {
          clientName: selectedClient.name,
          clientNumber: selectedClient.client_number,
          matterDescription: selectedMatter.description,
          matterNumber: selectedMatter.matter_number,
        } : undefined,
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "comparison.docx";
    a.click();
    URL.revokeObjectURL(url);
  }, [diffLines, diffFile1Name, diffFile2Name, summaryContent, selectedClient, selectedMatter]);

  const showDownload = diffLines.length > 0 && !isBusy && !isStreaming;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Document Compare</h1>
      <p className="text-gray-600 mb-6">
        Upload two documents to get a line-by-line comparison.
      </p>

      <div className="space-y-4">
        <ClientMatterSelect
          onSelect={handleClientMatterSelect}
          onClear={handleClientMatterClear}
        />

        <label className="flex items-center gap-2 px-1 cursor-pointer">
          <input
            type="checkbox"
            checked={includeSummary}
            onChange={(e) => setIncludeSummary(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Summary
          </span>
          <span className="text-xs text-gray-400">
            Append an AI-generated summary analysis to the comparison
          </span>
        </label>

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

        {file1 && file2 && !selectedMatter && !isBusy && (
          <p className="text-sm text-amber-600 text-center">
            Select a client and matter above before submitting.
          </p>
        )}

        {isBusy && (
          <button
            disabled
            className="w-full bg-gray-400 text-white py-3 px-4 rounded-xl font-medium cursor-not-allowed"
          >
            {isComparing ? "Comparing..." : "Generating summary..."}
          </button>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 font-medium">Error</p>
            <p className="text-red-600 text-sm mt-1">{error}</p>
          </div>
        )}

        {diffLines.length > 0 && (
          <DiffDisplay
            lines={diffLines}
            file1Name={diffFile1Name}
            file2Name={diffFile2Name}
          />
        )}

        {(summaryContent || isStreaming) && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 pt-2">Summary</h2>
            <StreamingResponse
              content={summaryContent}
              isStreaming={isStreaming}
              error={null}
            />
          </>
        )}

        {showDownload && (
          <button
            onClick={handleDownload}
            className="w-full bg-gray-800 text-white py-2.5 px-4 rounded-lg text-sm font-medium hover:bg-gray-900 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
        )}
      </div>
    </div>
  );
}
