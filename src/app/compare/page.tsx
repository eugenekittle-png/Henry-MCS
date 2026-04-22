"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import { useSessionState } from "@/lib/useSessionState";
import FileDropZone from "@/components/FileDropZone";
import FileList from "@/components/FileList";
import ClientMatterSelect from "@/components/ClientMatterSelect";
import DiffDisplay from "@/components/DiffDisplay";
import type { DiffLine } from "@/components/DiffDisplay";
import type { Client, Matter } from "@/types";

export default function ComparePage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && user.role !== "admin" && !user.pages.includes("compare")) {
      router.replace("/");
    }
  }, [user, router]);

  const [diffLines, setDiffLines] = useSessionState<DiffLine[]>("compare:diffLines", []);
  const [diffFile1Name, setDiffFile1Name] = useSessionState<string>("compare:diffFile1Name", "");
  const [diffFile2Name, setDiffFile2Name] = useSessionState<string>("compare:diffFile2Name", "");
  const [selectedClient, setSelectedClient] = useSessionState<Client | null>("compare:selectedClient", null);
  const [selectedMatter, setSelectedMatter] = useSessionState<Matter | null>("compare:selectedMatter", null);
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const canSubmit = file1 && file2 && selectedClient && selectedMatter && !isComparing;
  const hasResults = diffLines.length > 0 || isComparing;

  const handleReset = useCallback(() => {
    setFile1(null);
    setFile2(null);
    setDiffLines([]);
    setDiffFile1Name("");
    setDiffFile2Name("");
    setError(null);
    setSelectedClient(null);
    setSelectedMatter(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!file1 || !file2 || !selectedClient || !selectedMatter) return;

    setDiffLines([]);
    setError(null);
    setIsComparing(true);

    const formData = new FormData();
    formData.append("file1", file1);
    formData.append("file2", file2);
    formData.append("clientId", String(selectedClient.id));
    formData.append("matterId", String(selectedMatter.id));

    try {
      const diffRes = await fetch("/api/compare-diff", {
        method: "POST",
        body: formData,
      });

      if (!diffRes.ok) {
        const text = await diffRes.text();
        let msg = "Diff request failed";
        try { msg = JSON.parse(text).error || msg; } catch { msg = `Server error (${diffRes.status})`; }
        throw new Error(msg);
      }

      const diffData = await diffRes.json();
      setDiffLines(diffData.lines);
      setDiffFile1Name(diffData.file1Name);
      setDiffFile2Name(diffData.file2Name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsComparing(false);
    }
  }, [file1, file2, selectedClient, selectedMatter]);

  const handleDownload = useCallback(async () => {
    const res = await fetch("/api/export-compare-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        diff: { lines: diffLines, file1Name: diffFile1Name, file2Name: diffFile2Name },
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
    a.download = "comparison.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }, [diffLines, diffFile1Name, diffFile2Name, selectedClient, selectedMatter]);

  const showDownload = diffLines.length > 0 && !isComparing;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Compare</h1>
          <a href="/help#compare" title="Help" className="flex items-center justify-center w-6 h-6 rounded-full border border-gray-400 text-gray-500 hover:border-gray-600 hover:text-gray-700 transition-colors text-xs font-semibold">
            ?
          </a>
        </div>
        {hasResults && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            New Compare
          </button>
        )}
      </div>
      <p className="text-gray-600 mb-6">
        Upload two documents to get a line-by-line comparison.
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

        {file1 && file2 && !selectedMatter && !isComparing && (
          <p className="text-sm text-amber-600 text-center">
            Select a client and matter above before submitting.
          </p>
        )}

        {isComparing && (
          <button
            disabled
            className="w-full bg-gray-400 text-white py-3 px-4 rounded-xl font-medium cursor-not-allowed"
          >
            Comparing...
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
