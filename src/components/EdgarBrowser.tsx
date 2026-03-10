"use client";

import { useState, useRef } from "react";

export interface EdgarFiling {
  company: string;
  cik: string;
  formType: string;
  filingDate: string;
  period: string;
  accessionNo: string;
  label: string; // display label e.g. "Apple Inc. — 10-K (2024-11-01)"
}

interface Props {
  onAdd: (filing: EdgarFiling) => void;
  onClose: () => void;
  alreadyAdded: string[]; // accessionNo values already added
}

const FORM_TYPES = ["10-K", "10-Q", "8-K", "DEF 14A", "S-1", "20-F"];

export default function EdgarBrowser({ onAdd, onClose, alreadyAdded }: Props) {
  const [query, setQuery] = useState("");
  const [formType, setFormType] = useState("10-K");
  const [results, setResults] = useState<EdgarFiling[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch(`/api/edgar/search?q=${encodeURIComponent(query)}&forms=${encodeURIComponent(formType)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      const filings: EdgarFiling[] = (data.results ?? []).map((r: Omit<EdgarFiling, "label">) => ({
        ...r,
        label: `${r.company} — ${r.formType} (${r.filingDate})`,
      }));
      setResults(filings);
      if (filings.length === 0) setError("No filings found. Try a different company name or form type.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">SEC EDGAR Filing Search</h2>
            <p className="text-xs text-gray-500 mt-0.5">Free — no account required</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Search form */}
        <form onSubmit={handleSearch} className="px-5 py-4 border-b border-gray-100 space-y-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Company name or ticker (e.g. Apple, MSFT)"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <select
              value={formType}
              onChange={e => setFormType(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {FORM_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <button
            type="submit"
            disabled={!query.trim() || searching}
            className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {searching ? "Searching EDGAR..." : "Search"}
          </button>
        </form>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}
          {results.length > 0 && (
            <ul className="space-y-2">
              {results.map(filing => {
                const added = alreadyAdded.includes(filing.accessionNo);
                return (
                  <li key={filing.accessionNo} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-200 hover:bg-blue-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{filing.company}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        <span className="font-medium text-gray-700">{filing.formType}</span>
                        {" · "}Filed {filing.filingDate}
                        {filing.period && ` · Period ${filing.period}`}
                      </p>
                    </div>
                    <button
                      onClick={() => { onAdd(filing); }}
                      disabled={added}
                      className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-default bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500"
                    >
                      {added ? "Added" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!searching && results.length === 0 && !error && (
            <p className="text-sm text-gray-400 text-center py-6">Search for a company above to browse SEC filings.</p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100">
          <button onClick={onClose} className="w-full text-sm text-gray-600 hover:text-gray-900 py-1.5">Done</button>
        </div>
      </div>
    </div>
  );
}
