"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/AuthContext";
import FileDropZone from "@/components/FileDropZone";

interface MatrixTemplate {
  id: number;
  name: string;
  description: string | null;
  client_number: string | null;
  matter_number: string | null;
}

interface MatrixTemplateColumn {
  id: number;
  order_num: number;
  column_name: string;
  instruction: string | null;
}

interface ExtractionRow {
  filename: string;
  isConsensus: boolean;
  values: Record<string, string | null>;
}

interface ProgressState {
  current: number;
  total: number;
  file: string;
}

export default function MatrixExtractPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const templateId = Number(params.id);
  const abortRef = useRef<AbortController | null>(null);

  const [template, setTemplate] = useState<MatrixTemplate | null>(null);
  const [columns, setColumns] = useState<MatrixTemplateColumn[]>([]);
  const [loadError, setLoadError] = useState("");

  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [extractError, setExtractError] = useState("");

  const [rows, setRows] = useState<ExtractionRow[]>([]);
  const [done, setDone] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tRes, cRes] = await Promise.all([
        fetch(`/api/matrix/templates/${templateId}`),
        fetch(`/api/matrix/templates/${templateId}/columns`),
      ]);
      if (!tRes.ok) { setLoadError("Template not found."); return; }
      const { template } = await tRes.json();
      const { columns } = await cRes.json();
      setTemplate(template);
      setColumns(columns);
    } catch {
      setLoadError("Could not load template.");
    }
  }, [templateId]);

  useEffect(() => { load(); }, [load]);

  function handleFiles(incoming: File[]) {
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...incoming.filter((f) => !existing.has(f.name))];
    });
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  async function handleRun() {
    if (files.length === 0 || running) return;
    setRunning(true);
    setExtractError("");
    setRows([]);
    setDone(false);
    setProgress(null);

    const fd = new FormData();
    fd.append("templateId", String(templateId));
    files.forEach((f, i) => fd.append(`file_${i}`, f));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/matrix/extract", { method: "POST", body: fd, signal: controller.signal });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setExtractError(d.error || "Extraction failed.");
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          try {
            const event = JSON.parse(line.slice(5).trim());
            if (event.type === "progress") {
              setProgress({ current: event.current, total: event.total, file: event.file });
            } else if (event.type === "row") {
              setRows((prev) => [...prev, { filename: event.filename, isConsensus: false, values: event.values }]);
            } else if (event.type === "consensus") {
              setRows((prev) => [
                { filename: "Consensus", isConsensus: true, values: event.values },
                ...prev,
              ]);
            } else if (event.type === "done") {
              setDone(true);
              setProgress(null);
            } else if (event.type === "error") {
              setExtractError(event.message || "Extraction failed.");
            }
          } catch { /* skip malformed event */ }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") {
        setExtractError("Connection error during extraction.");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    setRunning(false);
    setProgress(null);
  }

  function handleReset() {
    setFiles([]);
    setRows([]);
    setDone(false);
    setExtractError("");
    setProgress(null);
  }

  function handleExportCsv() {
    if (!template || rows.length === 0) return;
    const colNames = columns.map((c) => c.column_name);

    const escape = (v: string | null | undefined) => {
      const s = v ?? "";
      // Wrap in quotes if contains comma, quote, or newline
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const header = ["Document", ...colNames].map(escape).join(",");
    const dataRows = rows.map((row) => {
      const label = row.isConsensus ? "Consensus" : row.filename;
      return [label, ...colNames.map((col) => row.values[col] ?? "")].map(escape).join(",");
    });

    const csv = [header, ...dataRows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `matrix-${template.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExportPdf() {
    if (!template || rows.length === 0) return;
    setExporting(true);
    try {
      const res = await fetch("/api/matrix/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: template.name,
          clientNumber: template.client_number,
          matterNumber: template.matter_number,
          columns: columns.map((c) => c.column_name),
          rows,
        }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `matrix-${template.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — could add an error state here if needed
    } finally {
      setExporting(false);
    }
  }

  if (!user) return null;

  if (loadError) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <p className="text-red-600">{loadError}</p>
        <button onClick={() => router.push("/matrix")} className="mt-4 text-sm text-blue-600 hover:underline">Back to Matrix</button>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="h-8 w-56 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  const colNames = columns.map((c) => c.column_name);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Back */}
      <button
        onClick={() => router.push("/matrix")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Matrix
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{template.name}</h1>
          {(template.client_number || template.matter_number) && (
            <p className="text-sm text-gray-500 mt-0.5">
              {template.client_number}{template.matter_number ? ` / ${template.matter_number}` : ""}
            </p>
          )}
          {template.description && <p className="text-xs text-gray-400 mt-0.5">{template.description}</p>}
        </div>
        <button
          onClick={() => router.push(`/matrix/${templateId}`)}
          className="text-xs text-gray-500 border border-gray-300 px-3 py-1.5 rounded-lg hover:border-gray-400 hover:text-gray-700 transition-colors"
        >
          Manage Columns
        </button>
      </div>

      {/* Column chips */}
      {columns.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          {columns.map((c) => (
            <span key={c.id} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full border border-gray-200" title={c.instruction ?? undefined}>
              {c.column_name}
            </span>
          ))}
        </div>
      )}

      {columns.length === 0 && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          This template has no columns.{" "}
          <button onClick={() => router.push(`/matrix/${templateId}`)} className="underline hover:no-underline">Add columns</button> before extracting.
        </div>
      )}

      {/* File upload — hide once results are shown */}
      {!done && (
        <div className="mb-5">
          <FileDropZone
            onFiles={handleFiles}
            multiple
            accept=".pdf,.doc,.docx,.xlsx,.txt,.csv,.md"
            label="Drop documents here or click to browse"
          />

          {files.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {files.map((f) => (
                <div key={f.name} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm text-gray-700 truncate">{f.name}</span>
                    <span className="text-xs text-gray-400 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                  </div>
                  {!running && (
                    <button onClick={() => removeFile(f.name)} className="ml-2 text-gray-300 hover:text-red-500 transition-colors shrink-0">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {extractError && (
            <p className="mt-3 text-sm text-red-600">{extractError}</p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleRun}
              disabled={running || files.length === 0 || columns.length === 0}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {running ? "Extracting…" : `Run Extraction${files.length > 0 ? ` (${files.length} file${files.length !== 1 ? "s" : ""})` : ""}`}
            </button>
            {running && (
              <button onClick={handleCancel} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:border-gray-400 transition-colors">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Progress */}
      {progress && (
        <div className="mb-5 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">
              Processing {progress.current} of {progress.total}
            </p>
            <p className="text-xs text-gray-400">{progress.file}</p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Results table */}
      {rows.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="text-sm font-semibold text-gray-700">
              {done
                ? `Extraction complete — ${rows.filter((r) => !r.isConsensus).length} document${rows.filter((r) => !r.isConsensus).length !== 1 ? "s" : ""}`
                : "Extracting…"}
            </p>
            {done && (
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 text-xs font-medium text-white bg-green-700 px-3 py-1.5 rounded-lg hover:bg-green-800 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download CSV
                </button>
                <button
                  onClick={handleExportPdf}
                  disabled={exporting}
                  className="flex items-center gap-1.5 text-xs font-medium text-white bg-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {exporting ? "Exporting…" : "Download PDF"}
                </button>
                <button
                  onClick={handleReset}
                  className="text-xs text-gray-500 border border-gray-300 px-3 py-1.5 rounded-lg hover:border-gray-400 hover:text-gray-700 transition-colors"
                >
                  New Extraction
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="sticky left-0 z-10 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap min-w-[180px] border-r border-gray-200">
                    Document
                  </th>
                  {colNames.map((col) => (
                    <th key={col} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap min-w-[160px]">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className={row.isConsensus ? "bg-blue-50 border-b-2 border-blue-200" : "bg-white hover:bg-gray-50 transition-colors"}
                  >
                    <td className={`sticky left-0 z-10 px-4 py-3 border-r border-gray-200 min-w-[180px] ${row.isConsensus ? "bg-blue-50" : "bg-white"}`}>
                      <div className="flex items-center gap-2">
                        {row.isConsensus && (
                          <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">Consensus</span>
                        )}
                        {!row.isConsensus && (
                          <span className="text-sm text-gray-700 truncate max-w-[160px]" title={row.filename}>{row.filename}</span>
                        )}
                      </div>
                    </td>
                    {colNames.map((col) => (
                      <td key={col} className="px-4 py-3 text-sm text-gray-700 min-w-[160px] max-w-[280px]">
                        {row.values[col] != null && row.values[col] !== ""
                          ? <span className="whitespace-pre-wrap break-words">{row.values[col]}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
