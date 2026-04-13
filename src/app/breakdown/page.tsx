"use client";

import { useState, useCallback } from "react";
import { upload } from "@vercel/blob/client";
import { useSessionState } from "@/lib/useSessionState";
import FileDropZone from "@/components/FileDropZone";
import FileList from "@/components/FileList";
import StreamingResponse from "@/components/StreamingResponse";
import ClientMatterSelect from "@/components/ClientMatterSelect";
import SummaryChat from "@/components/SummaryChat";
import { MAX_BREAKDOWN_FILE_SIZE } from "@/lib/constants";
import type { Client, Matter } from "@/types";
import type { ManifestFile, ManifestSummary } from "@/app/api/breakdown-manifest/route";

type FileStatus = ManifestFile["status"];

const STATUS_LABEL: Record<FileStatus, string> = {
  extractable: "Will be read",
  image: "Will be analyzed",
  image_large: "Image — too large (>5 MB)",
  video: "Video — not supported",
  unsupported: "Unsupported type",
  skipped: "Skipped",
};

const STATUS_COLOR: Record<FileStatus, string> = {
  extractable: "bg-green-100 text-green-800",
  image: "bg-green-100 text-green-800",
  image_large: "bg-amber-100 text-amber-800",
  video: "bg-red-100 text-red-700",
  unsupported: "bg-gray-100 text-gray-600",
  skipped: "bg-gray-100 text-gray-400",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function estimateTime(files: ManifestFile[]): string {
  const extractable = files.filter(f => f.status === "extractable");
  const totalBytes = extractable.reduce((sum, f) => sum + f.size, 0);
  const totalMB = totalBytes / 1024 / 1024;
  const seconds = 20 + extractable.length * 8 + totalMB * 10;
  if (seconds < 60) return "under a minute";
  const mins = seconds / 60;
  if (mins < 2) return "1-2 minutes";
  if (mins < 4) return "2-4 minutes";
  if (mins < 6) return "4-6 minutes";
  return "5+ minutes";
}

async function streamResponse(
  url: string,
  body: Record<string, unknown>,
  onText: (text: string) => void,
  onError: (err: string) => void,
  onProgress?: (p: { stage: string; current: number; total: number; file: string }) => void,
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let errorMsg = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      errorMsg = data.error || errorMsg;
    } catch {
      const text = await response.text().catch(() => "");
      if (text) errorMsg = text.slice(0, 200);
    }
    throw new Error(errorMsg);
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
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) { onError(parsed.error); return; }
        if (parsed.progress) onProgress?.(parsed.progress);
        if (parsed.text) onText(parsed.text);
      } catch { /* skip malformed */ }
    }
  }
}

export default function BreakdownPage() {
  const [content, setContent] = useSessionState<string>("breakdown:content", "");
  const [selectedClient, setSelectedClient] = useSessionState<Client | null>("breakdown:selectedClient", null);
  const [selectedMatter, setSelectedMatter] = useSessionState<Matter | null>("breakdown:selectedMatter", null);

  const [files, setFiles] = useState<File[]>([]);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [manifest, setManifest] = useState<{ files: ManifestFile[]; summary: ManifestSummary } | null>(null);
  const [manifestCollapsed, setManifestCollapsed] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [progress, setProgress] = useState<{ stage: string; current: number; total: number; file: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Focused single-file state
  const [focusedFile, setFocusedFile] = useState<ManifestFile | null>(null);
  const [focusedContent, setFocusedContent] = useState("");
  const [focusedStreaming, setFocusedStreaming] = useState(false);
  const [focusedError, setFocusedError] = useState<string | null>(null);
  const [analyzingFilePath, setAnalyzingFilePath] = useState<string | null>(null);

  const deleteBlob = useCallback((url: string | null) => {
    if (!url) return;
    fetch("/api/blob/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }).catch(() => {});
  }, []);

  const handleFiles = useCallback((newFiles: File[]) => {
    setFiles(newFiles.slice(0, 1));
    setBlobUrl(prev => { deleteBlob(prev); return null; });
    setManifest(null);
    setManifestCollapsed(false);
    setFocusedFile(null);
    setFocusedContent("");
    setError(null);
  }, [deleteBlob]);

  const handleRemove = useCallback(() => {
    setFiles([]);
    setBlobUrl(prev => { deleteBlob(prev); return null; });
    setManifest(null);
    setManifestCollapsed(false);
    setFocusedFile(null);
    setFocusedContent("");
    setError(null);
  }, [deleteBlob]);

  const handleClientMatterSelect = useCallback((client: Client, matter: Matter) => {
    setSelectedClient(client);
    setSelectedMatter(matter);
  }, []);

  const handleClientMatterClear = useCallback(() => {
    setSelectedClient(null);
    setSelectedMatter(null);
  }, []);

  const isBusy = isStreaming || focusedStreaming;
  const canScan = files.length > 0 && selectedClient && selectedMatter && !isScanning && !isBusy;
  const canAnalyzeAll = !!manifest && (manifest.summary.extractable > 0 || manifest.summary.image > 0) && !!selectedClient && !!selectedMatter && !isBusy;
  const hasResults = !!content || isStreaming;

  const handleReset = useCallback(() => {
    setBlobUrl(prev => { deleteBlob(prev); return null; });
    setFiles([]);
    setManifest(null);
    setManifestCollapsed(false);
    setContent("");
    setError(null);
    setProgress(null);
    setFocusedFile(null);
    setFocusedContent("");
    setFocusedError(null);
    setSelectedClient(null);
    setSelectedMatter(null);
  }, [deleteBlob]);

  const handleScan = useCallback(async () => {
    if (!files.length || !selectedClient || !selectedMatter) return;
    setManifest(null);
    setManifestCollapsed(false);
    setFocusedFile(null);
    setFocusedContent("");
    setError(null);
    setIsScanning(true);
    try {
      // Upload zip directly to Vercel Blob (bypasses serverless function size limit)
      const blob = await upload(files[0].name, files[0], {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      setBlobUrl(blob.url);

      const res = await fetch("/api/breakdown-manifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: blob.url, fileName: files[0].name }),
      });
      if (!res.ok) {
        let errorMsg = `Scan failed (${res.status})`;
        try { const data = await res.json(); errorMsg = data.error || errorMsg; } catch { /* ignore */ }
        throw new Error(errorMsg);
      }
      const data = await res.json();
      setManifest(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsScanning(false);
    }
  }, [files, selectedClient, selectedMatter]);

  const handleAnalyzeAll = useCallback(async () => {
    if (!blobUrl || !selectedClient || !selectedMatter) return;
    setContent("");
    setError(null);
    setProgress(null);
    setFocusedFile(null);
    setFocusedContent("");
    setManifestCollapsed(true);
    setIsStreaming(true);
    try {
      await streamResponse(
        "/api/breakdown",
        { blobUrl, fileName: files[0]?.name ?? "upload.zip", clientId: selectedClient.id, matterId: selectedMatter.id },
        (text) => setContent(prev => prev + text),
        (err) => { setError(err); setIsStreaming(false); },
        (p) => setProgress(p as { stage: string; current: number; total: number; file: string }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsStreaming(false);
    }
  }, [blobUrl, files, selectedClient, selectedMatter]);

  const handleAnalyzeFile = useCallback(async (manifestFile: ManifestFile) => {
    if (!blobUrl || !selectedClient || !selectedMatter) return;
    setFocusedFile(manifestFile);
    setFocusedContent("");
    setFocusedError(null);
    setFocusedStreaming(true);
    setAnalyzingFilePath(manifestFile.path);
    try {
      await streamResponse(
        "/api/breakdown-file",
        { blobUrl, zipFileName: files[0]?.name ?? "upload.zip", filePath: manifestFile.path, clientId: selectedClient.id, matterId: selectedMatter.id },
        (text) => setFocusedContent(prev => prev + text),
        (err) => { setFocusedError(err); setFocusedStreaming(false); },
      );
    } catch (err) {
      setFocusedError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setFocusedStreaming(false);
      setAnalyzingFilePath(null);
    }
  }, [blobUrl, files, selectedClient, selectedMatter]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Breakdown</h1>
          <a href="/help#breakdown" title="Help" className="flex items-center justify-center w-6 h-6 rounded-full border border-gray-400 text-gray-500 hover:border-gray-600 hover:text-gray-700 transition-colors text-xs font-semibold">
            ?
          </a>
        </div>
        {(hasResults || manifest) && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            New Breakdown
          </button>
        )}
      </div>
      <p className="text-gray-600 mb-6">
        Upload a zip file of documents to get an organized catalog and analysis.
      </p>

      <div className="space-y-4">
        {/* Client/matter — selector before results, badge after */}
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

        {/* Upload + scan — only before results */}
        {!hasResults && (
          <>
            <FileDropZone
              onFiles={handleFiles}
              accept=".zip"
              multiple={false}
              label="Drop a zip file here or click to browse"
              maxFileSize={MAX_BREAKDOWN_FILE_SIZE}
            />
            <FileList files={files} onRemove={() => handleRemove()} />

            {files.length > 0 && !selectedMatter && (
              <p className="text-sm text-amber-600 text-center">
                Select a client and matter above before submitting.
              </p>
            )}

            {canScan && !manifest && (
              <button
                onClick={handleScan}
                className="w-full bg-gray-700 text-white py-3 px-4 rounded-xl font-medium hover:bg-gray-800 transition-colors"
              >
                Scan Contents
              </button>
            )}

            {isScanning && (
              <button disabled className="w-full bg-gray-400 text-white py-3 px-4 rounded-xl font-medium cursor-not-allowed">
                Scanning...
              </button>
            )}
          </>
        )}

        {/* Manifest — persists after analysis, collapsible */}
        {manifest && (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Header — always visible, toggles collapse */}
            <button
              onClick={() => setManifestCollapsed(c => !c)}
              className="w-full px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between hover:bg-gray-100 transition-colors"
            >
              <span className="text-sm font-semibold text-gray-700">
                {manifest.summary.total} file{manifest.summary.total !== 1 ? "s" : ""} in zip
              </span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  {(manifest.summary.extractable + manifest.summary.image) > 0 && (
                    <span className="text-green-700">{manifest.summary.extractable + manifest.summary.image} processable</span>
                  )}
                  {manifest.summary.image_large > 0 && (
                    <span className="text-amber-700">{manifest.summary.image_large} large image{manifest.summary.image_large !== 1 ? "s" : ""}</span>
                  )}
                  {manifest.summary.video > 0 && (
                    <span className="text-red-600">{manifest.summary.video} video{manifest.summary.video !== 1 ? "s" : ""}</span>
                  )}
                  {manifest.summary.unsupported > 0 && (
                    <span className="text-gray-500">{manifest.summary.unsupported} unsupported</span>
                  )}
                </div>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${manifestCollapsed ? "" : "rotate-180"}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* File list — hidden when collapsed */}
            {!manifestCollapsed && (
              <>
                <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
                  {manifest.files.map((f) => (
                    <li key={f.path} className="flex items-center justify-between px-4 py-2.5 text-sm gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-gray-800 truncate block">{f.name}</span>
                        {f.path !== f.name && (
                          <span className="text-xs text-gray-400 truncate block">{f.path}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-400">{formatSize(f.size)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[f.status]}`}>
                          {STATUS_LABEL[f.status]}
                        </span>
                        {(f.status === "extractable" || f.status === "image" || f.status === "image_large") && (
                          <button
                            onClick={() => handleAnalyzeFile(f)}
                            disabled={isBusy}
                            className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                          >
                            {analyzingFilePath === f.path ? (
                              <>
                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Analyzing...
                              </>
                            ) : "Analyze"}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                {manifest.summary.extractable === 0 && manifest.summary.image === 0 && (
                  <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 text-sm text-amber-800">
                    No processable files found. The zip may contain only large images, videos, or unsupported file types.
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Analyze all — only before full results */}
        {canAnalyzeAll && !hasResults && (
          <div className="space-y-1">
            <button
              onClick={handleAnalyzeAll}
              className="w-full bg-green-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-green-700 transition-colors"
            >
              {(() => {
                const processable = manifest!.summary.extractable + manifest!.summary.image;
                const skipped = manifest!.summary.total - processable;
                return `Analyze all ${processable} file${processable !== 1 ? "s" : ""}${skipped > 0 ? ` (${skipped} will be skipped)` : ""}`;
              })()}
            </button>
            <p className="text-xs text-center text-gray-400">
              Estimated time: {estimateTime(manifest!.files)}
            </p>
          </div>
        )}

        {/* Full breakdown progress */}
        {isStreaming && (
          <div className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-2">
            {progress?.stage === "parsing" && progress.total > 0 ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 font-medium">Parsing files...</span>
                  <span className="text-gray-400">{progress.current} / {progress.total}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-green-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                  />
                </div>
                {progress.file && (
                  <p className="text-xs text-gray-400 truncate">{progress.file}</p>
                )}
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <svg className="w-4 h-4 animate-spin text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <span>Analyzing with AI...</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 font-medium">Error</p>
            <p className="text-red-600 text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Full breakdown result */}
        <StreamingResponse
          content={content}
          isStreaming={isStreaming}
          error={null}
          clientMatter={selectedClient && selectedMatter ? {
            clientName: selectedClient.name,
            clientNumber: selectedClient.client_number,
            matterDescription: selectedMatter.description,
            matterNumber: selectedMatter.matter_number,
          } : null}
        />

        {content && !isStreaming && (
          <SummaryChat
            summaryContent={content}
            documentNames={files.map(f => f.name)}
          />
        )}

        {/* Focused single-file result */}
        {focusedFile && (focusedContent || focusedStreaming || focusedError) && (
          <div className="border border-blue-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
              <span className="text-sm font-semibold text-blue-800 truncate">{focusedFile.name}</span>
              {!focusedStreaming && (
                <button
                  onClick={() => { setFocusedFile(null); setFocusedContent(""); setFocusedError(null); }}
                  className="text-blue-400 hover:text-blue-700 text-lg leading-none flex-shrink-0 ml-2"
                >
                  &times;
                </button>
              )}
            </div>
            <div className="p-4 space-y-4">
              <StreamingResponse
                content={focusedContent}
                isStreaming={focusedStreaming}
                error={focusedError}
                clientMatter={selectedClient && selectedMatter ? {
                  clientName: selectedClient.name,
                  clientNumber: selectedClient.client_number,
                  matterDescription: selectedMatter.description,
                  matterNumber: selectedMatter.matter_number,
                } : null}
              />
              {focusedContent && !focusedStreaming && (
                <SummaryChat
                  summaryContent={focusedContent}
                  documentNames={[focusedFile.name]}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
