"use client";

import { useRef, useState } from "react";
import { downloadCSV } from "@/lib/csv";

interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
  tempPassword?: string;
}

interface Props {
  endpoint: string;
  templateFilename: string;
  templateColumns: string[];          // required CSV column keys
  optionalColumns?: string[];         // optional CSV column keys (shown as hints, included in template)
  templateSample: string[][];         // sample rows matching required + optional columns in order
  label: string;
  onDone: () => void;
}

export default function CsvImport({ endpoint, templateFilename, templateColumns, optionalColumns = [], templateSample, label, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const allColumns = [...templateColumns, ...optionalColumns];

  function downloadTemplate() {
    const rows = templateSample.map(r => {
      const obj: Record<string, string> = {};
      allColumns.forEach((col, i) => { obj[col] = r[i] ?? ""; });
      return obj;
    });
    downloadCSV(templateFilename, rows, allColumns.map(c => ({ key: c, label: c })));
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const text = await file.text();
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: text,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Import failed"); return; }
      setResult(data);
      if (data.imported > 0) onDone();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function reset() {
    setOpen(false);
    setResult(null);
    setError(null);
  }

  return (
    <div>
      <button
        onClick={() => { setOpen(o => !o); setResult(null); setError(null); }}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        Import CSV
      </button>

      {open && (
        <div className="mt-3 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Import {label} from CSV</p>
            <button onClick={reset} className="text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span>Columns:</span>
            {templateColumns.map(c => (
              <code key={c} className="px-1.5 py-0.5 bg-gray-200 rounded text-gray-700">{c}</code>
            ))}
            {optionalColumns.map(c => (
              <code key={c} className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-400 border border-dashed border-gray-300">{c} <span className="font-normal">optional</span></code>
            ))}
            <button
              onClick={downloadTemplate}
              className="ml-auto flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download template
            </button>
          </div>

          {!result && (
            <label className={`flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 cursor-pointer hover:border-gray-400 hover:bg-white transition-colors ${loading ? "opacity-50 pointer-events-none" : ""}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {loading ? "Importing…" : "Choose CSV file"}
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} disabled={loading} />
            </label>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          {result && (
            <div className="space-y-2">
              <div className="flex gap-3 text-sm">
                <span className="flex items-center gap-1.5 text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  {result.imported} imported
                </span>
                {result.skipped > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                    {result.skipped} skipped (already exist)
                  </span>
                )}
                {result.errors.length > 0 && (
                  <span className="flex items-center gap-1.5 text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">
                    {result.errors.length} errors
                  </span>
                )}
              </div>

              {result.tempPassword && (
                <p className="text-xs text-gray-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  Imported users have a temporary password: <code className="font-mono font-semibold">{result.tempPassword}</code> — they will be prompted to change it on first login.
                </p>
              )}

              {result.errors.length > 0 && (
                <ul className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <li key={i}>Row {e.row}: {e.reason}</li>
                  ))}
                </ul>
              )}

              <button
                onClick={() => { setResult(null); }}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Import another file
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
