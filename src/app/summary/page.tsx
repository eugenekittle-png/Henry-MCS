"use client";

import { useState, useCallback } from "react";
import { useSessionState } from "@/lib/useSessionState";
import FileDropZone from "@/components/FileDropZone";
import FileList from "@/components/FileList";
import StreamingResponse from "@/components/StreamingResponse";
import SummaryChat from "@/components/SummaryChat";
import ClientMatterSelect from "@/components/ClientMatterSelect";
import EdgarButton from "@/components/EdgarButton";
import type { EdgarFiling } from "@/components/EdgarBrowser";
import type { Client, Matter } from "@/types";

export default function SummaryPage() {
  const [content, setContent] = useSessionState<string>("summary:content", "");
  const [selectedClient, setSelectedClient] = useSessionState<Client | null>("summary:selectedClient", null);
  const [selectedMatter, setSelectedMatter] = useSessionState<Matter | null>("summary:selectedMatter", null);
  const [files, setFiles] = useState<File[]>([]);
  const [edgarFilings, setEdgarFilings] = useState<EdgarFiling[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleEdgarAdd = useCallback((filing: EdgarFiling) => {
    setEdgarFilings(prev => prev.find(f => f.accessionNo === filing.accessionNo) ? prev : [...prev, filing]);
  }, []);

  const handleEdgarRemove = useCallback((accessionNo: string) => {
    setEdgarFilings(prev => prev.filter(f => f.accessionNo !== accessionNo));
  }, []);

  const totalSources = files.length + edgarFilings.length;
  const canSubmit = totalSources > 0 && selectedClient && selectedMatter && !isStreaming;
  const hasResults = !!content || isStreaming;

  const handleReset = useCallback(() => {
    setFiles([]);
    setEdgarFilings([]);
    setContent("");
    setError(null);
    setSelectedClient(null);
    setSelectedMatter(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!totalSources || !selectedClient || !selectedMatter) return;

    setContent("");
    setError(null);
    setIsStreaming(true);

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    if (edgarFilings.length > 0) {
      formData.append("edgarFilings", JSON.stringify(edgarFilings));
    }
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
  }, [files, edgarFilings, totalSources, selectedClient, selectedMatter]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Document Summary</h1>
        {hasResults && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            New Summary
          </button>
        )}
      </div>
      <p className="text-gray-600 mb-6">
        Upload documents to get a comprehensive AI-generated summary.
      </p>

      <div className="space-y-4">
        {!hasResults ? (
          <ClientMatterSelect
            onSelect={handleClientMatterSelect}
            onClear={handleClientMatterClear}
          />
        ) : selectedClient && selectedMatter && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="font-medium text-gray-700">{selectedClient.name}</span>
            <span className="text-gray-300">/</span>
            <span>{selectedMatter.description}</span>
          </div>
        )}
        <FileDropZone onFiles={handleFiles} />
        <FileList files={files} onRemove={handleRemove} />

        {/* EDGAR option */}
        <div className="flex items-center gap-3">
          <EdgarButton onAdd={handleEdgarAdd} alreadyAdded={edgarFilings.map(f => f.accessionNo)} />
        </div>

        {/* EDGAR filing list */}
        {edgarFilings.length > 0 && (
          <ul className="space-y-1.5">
            {edgarFilings.map(f => (
              <li key={f.accessionNo} className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-blue-900 truncate block">{f.company}</span>
                  <span className="text-xs text-blue-600">{f.formType} · Filed {f.filingDate}</span>
                </div>
                <button onClick={() => handleEdgarRemove(f.accessionNo)} className="text-blue-400 hover:text-blue-700 text-lg leading-none flex-shrink-0">&times;</button>
              </li>
            ))}
          </ul>
        )}

        {canSubmit && (
          <button
            onClick={handleSubmit}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-blue-700 transition-colors"
          >
            Summarize {totalSources} source{totalSources !== 1 ? "s" : ""}
          </button>
        )}

        {totalSources > 0 && !selectedMatter && !isStreaming && (
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

        {content && !isStreaming && !error && (
          <SummaryChat
            summaryContent={content}
            documentNames={[
            ...files.map(f => f.name),
            ...edgarFilings.map(f => `${f.company} ${f.formType} (${f.filingDate})`),
          ]}
          />
        )}
      </div>
    </div>
  );
}
