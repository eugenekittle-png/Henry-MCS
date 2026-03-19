"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ClientMatterSelect from "@/components/ClientMatterSelect";
import type { Client, Matter } from "@/types";

interface Playbook { id: number; name: string; description: string | null; item_count: number; }

export default function ReviewPage() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [playbooksLoaded, setPlaybooksLoaded] = useState(false);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedMatter, setSelectedMatter] = useState<Matter | null>(null);
  const [content, setContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/playbooks")
      .then(r => r.json())
      .then(d => { setPlaybooks(d.playbooks ?? []); setPlaybooksLoaded(true); });
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }

  const handleClientMatterSelect = useCallback((client: Client, matter: Matter) => {
    setSelectedClient(client);
    setSelectedMatter(matter);
  }, []);

  const handleClientMatterClear = useCallback(() => {
    setSelectedClient(null);
    setSelectedMatter(null);
  }, []);

  const canSubmit = !!file && !!selectedPlaybookId && !isStreaming;

  async function handleSubmit() {
    if (!canSubmit || !file || !selectedPlaybookId) return;
    setContent("");
    setError(null);
    setIsStreaming(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("playbookId", String(selectedPlaybookId));
    if (selectedClient) formData.append("clientId", String(selectedClient.id));
    if (selectedMatter) formData.append("matterId", String(selectedMatter.id));

    try {
      const response = await fetch("/api/review", { method: "POST", body: formData });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) setContent(prev => prev + parsed.text);
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsStreaming(false);
    }
  }

  const selectedPlaybook = playbooks.find(p => p.id === selectedPlaybookId);
  const ACCEPTED = ".pdf,.doc,.docx,.txt";

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Playbook Review</h1>
        <p className="text-gray-500 text-sm mt-1">Review a document against a defined legal checklist</p>
      </div>

      {!content && (
        <div className="space-y-4 mb-6">
          {/* Playbook selector */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <label className="block text-sm font-semibold text-gray-800 mb-3">Select Playbook *</label>
            {!playbooksLoaded ? (
              <p className="text-sm text-gray-400">Loading playbooks...</p>
            ) : playbooks.length === 0 ? (
              <p className="text-sm text-gray-500">No playbooks available. Ask an admin to create one.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {playbooks.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlaybookId(p.id)}
                    className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                      selectedPlaybookId === p.id
                        ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                    {p.description && <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>}
                    <p className="text-xs text-gray-400 mt-1">{p.item_count} items</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* File upload */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <label className="block text-sm font-semibold text-gray-800 mb-3">Upload Document *</label>
            {file ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                </div>
                <button onClick={() => setFile(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
              </div>
            ) : (
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragOver ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <svg className="w-8 h-8 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                <p className="text-sm font-medium text-gray-600">Drop a document here or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">PDF, DOCX, DOC, TXT — max 10MB</p>
                <input ref={fileInputRef} type="file" accept={ACCEPTED} onChange={handleFileInput} className="hidden" />
              </div>
            )}
          </div>

          {/* Client/Matter (optional) */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <label className="block text-sm font-semibold text-gray-800 mb-3">Client &amp; Matter <span className="text-gray-400 font-normal">(optional)</span></label>
            <ClientMatterSelect
              onSelect={handleClientMatterSelect}
              onClear={handleClientMatterClear}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isStreaming ? "Running Review..." : selectedPlaybook ? `Run ${selectedPlaybook.name}` : "Run Review"}
          </button>
        </div>
      )}

      {/* Streaming result */}
      {(content || isStreaming) && (
        <div>
          {/* Header bar */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {selectedPlaybook?.name ?? "Review"} — {file?.name}
              </h2>
              {selectedClient && selectedMatter && (
                <p className="text-xs text-gray-500 mt-0.5">{selectedClient.name} · {selectedMatter.description}</p>
              )}
            </div>
            {!isStreaming && (
              <button
                onClick={() => { setContent(""); setFile(null); setError(null); }}
                className="text-sm text-blue-600 hover:underline"
              >
                ← New Review
              </button>
            )}
          </div>

          {isStreaming && !content && (
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              Reviewing document...
            </div>
          )}

          <div className="bg-gray-100 text-sm text-gray-800 rounded-xl p-6 prose prose-xl max-w-none font-sans prose-p:my-1 prose-headings:font-semibold prose-h2:border-b prose-h2:border-gray-100 prose-h2:pb-2 prose-strong:font-semibold leading-[1.98]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            {isStreaming && <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-middle" />}
          </div>
        </div>
      )}
    </div>
  );
}
