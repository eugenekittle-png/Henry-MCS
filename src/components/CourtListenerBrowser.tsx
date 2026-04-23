"use client";

import { useState } from "react";

export interface CourtListenerOpinion {
  clusterId: number;
  caseName: string;
  court: string;
  dateFiled: string;
  citation: string;
  snippet: string;
  absoluteUrl: string;
}

const COURT_FILTERS = [
  { label: "All Courts", value: "" },
  { label: "US Supreme Court", value: "scotus" },
];

function stripSnippetHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

interface Props {
  onAdd: (opinion: CourtListenerOpinion) => void;
  onClose: () => void;
  alreadyAdded: string[];
}

export default function CourtListenerBrowser({ onAdd, onClose, alreadyAdded }: Props) {
  const [query, setQuery] = useState("");
  const [court, setCourt] = useState("");
  const [precedentialOnly, setPrecedentialOnly] = useState(true);
  const [caseNameMode, setCaseNameMode] = useState(false);
  const [results, setResults] = useState<CourtListenerOpinion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setCount(null);
    try {
      // Case name mode wraps the query so only the case title field is matched
      const q = caseNameMode ? `caseName:"${query.trim()}"` : query.trim();
      const params = new URLSearchParams({ q });
      if (court) params.set("court", court);
      if (precedentialOnly) params.set("precedential", "1");
      const res = await fetch(`/api/courtlistener/search?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      if (!data.results?.length) setError("No cases found. Try different search terms or uncheck the filters below.");
      setResults(data.results ?? []);
      setCount(data.count ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[82vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">CourtListener</h2>
            <p className="text-xs text-gray-500 mt-0.5">Free Law Project — US case law database</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Case name, citation, or legal topic..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <select
              value={court}
              onChange={e => setCourt(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {COURT_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={precedentialOnly}
                onChange={e => setPrecedentialOnly(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-600">Precedential only</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={caseNameMode}
                onChange={e => setCaseNameMode(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-600">Match case name only</span>
            </label>
          </div>
          <button
            type="submit"
            disabled={!query.trim() || loading}
            className="mt-2 w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "Searching..." : "Search Cases"}
          </button>
        </form>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}

          {count !== null && results.length > 0 && (
            <p className="text-xs text-gray-400 pb-1">{count.toLocaleString()} total results — showing top {results.length}</p>
          )}

          {results.map(r => {
            const key = String(r.clusterId);
            const added = alreadyAdded.includes(key);
            return (
              <div key={key} className="flex items-start justify-between gap-3 px-3 py-3 rounded-lg border border-gray-200 hover:border-blue-200 hover:bg-blue-50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{r.caseName}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                    {r.citation && <span className="text-xs text-blue-700 font-mono">{r.citation}</span>}
                    {r.court && <span className="text-xs text-gray-500">{r.court}</span>}
                    {r.dateFiled && <span className="text-xs text-gray-400">{r.dateFiled}</span>}
                  </div>
                  {r.snippet && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                      {stripSnippetHtml(r.snippet)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => onAdd(r)}
                  disabled={added}
                  className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-default"
                >
                  {added ? "Added" : "Add"}
                </button>
              </div>
            );
          })}

          {!loading && !error && results.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">
              Search for a case name, citation (e.g. 410 U.S. 113), or legal topic above.
            </p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Data:{" "}
            <a href="https://www.courtlistener.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
              CourtListener
            </a>{" "}
            / Free Law Project (CC BY-SA)
          </p>
          <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-900">Done</button>
        </div>
      </div>
    </div>
  );
}
