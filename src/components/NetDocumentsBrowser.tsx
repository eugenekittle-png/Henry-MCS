"use client";

import { useState, useCallback, useEffect } from "react";
import { useNetDocuments } from "./NetDocumentsContext";
import type { NDCabinet, NDSearchResult } from "@/lib/netdocuments/types";

interface NetDocumentsBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onFiles: (files: File[]) => void;
  mode: "single" | "multiple";
  accept?: string[];
}

export default function NetDocumentsBrowser({
  isOpen,
  onClose,
  onFiles,
  mode,
  accept,
}: NetDocumentsBrowserProps) {
  const { isConnected, connect } = useNetDocuments();
  const [cabinets, setCabinets] = useState<NDCabinet[]>([]);
  const [selectedCabinet, setSelectedCabinet] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NDSearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load cabinets when connected
  useEffect(() => {
    if (!isOpen || !isConnected) return;
    fetch("/api/netdocuments/cabinets")
      .then((r) => r.json())
      .then((data) => {
        const cabs = data.cabinets || [];
        setCabinets(cabs);
        if (cabs.length === 1) setSelectedCabinet(cabs[0].id);
      })
      .catch(() => setError("Failed to load cabinets"));
  }, [isOpen, isConnected]);

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setResults([]);
      setSelected(new Set());
      setQuery("");
      setError(null);
    }
  }, [isOpen]);

  const handleSearch = useCallback(async () => {
    if (!selectedCabinet || !query.trim()) return;
    setIsSearching(true);
    setError(null);
    setResults([]);
    setSelected(new Set());

    try {
      const params = new URLSearchParams({ cabinet: selectedCabinet, q: query.trim() });
      const res = await fetch(`/api/netdocuments/search?${params}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Search failed");

      let items: NDSearchResult[] = data.results || [];

      // Filter by accepted extensions if specified
      if (accept?.length) {
        const exts = accept.map((e) => e.replace(".", "").toLowerCase());
        items = items.filter((d) => exts.includes(d.extension.toLowerCase()));
      }

      setResults(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }, [selectedCabinet, query, accept]);

  const toggleSelect = useCallback(
    (id: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          if (mode === "single") {
            return new Set([id]);
          }
          next.add(id);
        }
        return next;
      });
    },
    [mode]
  );

  const handleAddFiles = useCallback(async () => {
    if (selected.size === 0) return;
    setIsDownloading(true);
    setError(null);

    try {
      const files: File[] = [];

      for (const id of selected) {
        const res = await fetch(`/api/netdocuments/download?id=${encodeURIComponent(id)}`);
        if (!res.ok) throw new Error("Download failed");

        const filename = res.headers.get("X-ND-Filename") || `document-${id}`;
        const blob = await res.blob();
        const file = new File([blob], filename, { type: blob.type });
        files.push(file);
      }

      onFiles(files);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setIsDownloading(false);
    }
  }, [selected, onFiles, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">NetDocuments</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!isConnected ? (
            <div className="text-center py-8">
              <p className="text-gray-600 mb-4">
                Connect to your NetDocuments account to browse and import documents.
              </p>
              <button
                onClick={() => connect()}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Connect to NetDocuments
              </button>
            </div>
          ) : (
            <>
              {/* Cabinet selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cabinet</label>
                <select
                  value={selectedCabinet}
                  onChange={(e) => setSelectedCabinet(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a cabinet...</option>
                  {cabinets.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search documents..."
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={handleSearch}
                  disabled={!selectedCabinet || !query.trim() || isSearching}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {isSearching ? "..." : "Search"}
                </button>
              </div>

              {/* Results */}
              {results.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y max-h-60 overflow-y-auto">
                  {results.map((doc) => (
                    <label
                      key={doc.id}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 ${
                        selected.has(doc.id) ? "bg-blue-50" : ""
                      }`}
                    >
                      <input
                        type={mode === "single" ? "radio" : "checkbox"}
                        checked={selected.has(doc.id)}
                        onChange={() => toggleSelect(doc.id)}
                        className="w-4 h-4 text-blue-600"
                        name="nd-doc-select"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {doc.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          .{doc.extension} &middot;{" "}
                          {doc.size > 0
                            ? `${(doc.size / 1024).toFixed(0)} KB`
                            : ""}
                          {doc.modifiedDate &&
                            ` \u00b7 ${new Date(doc.modifiedDate).toLocaleDateString()}`}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {results.length === 0 && !isSearching && query && selectedCabinet && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No documents found. Try a different search term.
                </p>
              )}
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 text-center">{error}</p>
          )}
        </div>

        {/* Footer */}
        {isConnected && selected.size > 0 && (
          <div className="border-t px-5 py-3 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddFiles}
              disabled={isDownloading}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {isDownloading
                ? "Downloading..."
                : `Add ${selected.size} file${selected.size !== 1 ? "s" : ""}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
