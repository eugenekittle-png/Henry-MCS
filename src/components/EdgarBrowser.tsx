"use client";

import { useState } from "react";

export interface EdgarFiling {
  company: string;
  cik: string;
  ticker: string;
  formType: string;
  filingDate: string;
  accessionNo: string;
  primaryDocument: string;
  label: string;
}

interface Company { cik: string; name: string; ticker: string }
interface FilingResult { filingDate: string; accessionNo: string; primaryDocument: string }

interface Props {
  onAdd: (filing: EdgarFiling) => void;
  onClose: () => void;
  alreadyAdded: string[];
}

const FORM_TYPES = ["10-K", "10-Q", "8-K", "DEF 14A", "S-1", "20-F"];

export default function EdgarBrowser({ onAdd, onClose, alreadyAdded }: Props) {
  const [query, setQuery] = useState("");
  const [formType, setFormType] = useState("10-K");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [filings, setFilings] = useState<FilingResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [filingsLoading, setFilingsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearchLoading(true);
    setError(null);
    setCompanies([]);
    setSelectedCompany(null);
    setFilings([]);
    try {
      const res = await fetch(`/api/edgar/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      if (!data.results?.length) setError("No companies found. Try a different name or ticker.");
      setCompanies(data.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleSelectCompany(company: Company) {
    setSelectedCompany(company);
    setFilings([]);
    setError(null);
    setFilingsLoading(true);
    try {
      const res = await fetch(`/api/edgar/filings?cik=${company.cik}&type=${encodeURIComponent(formType)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load filings");
      if (!data.results?.length) setError(`No ${formType} filings found for ${company.name}.`);
      setFilings(data.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load filings");
    } finally {
      setFilingsLoading(false);
    }
  }

  function handleAdd(filing: FilingResult) {
    if (!selectedCompany) return;
    onAdd({
      company: selectedCompany.name,
      cik: selectedCompany.cik,
      ticker: selectedCompany.ticker,
      formType,
      filingDate: filing.filingDate,
      accessionNo: filing.accessionNo,
      primaryDocument: filing.primaryDocument,
      label: `${selectedCompany.name} — ${formType} (${filing.filingDate})`,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[82vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">SEC EDGAR</h2>
            <p className="text-xs text-gray-500 mt-0.5">Free public filings database — no account required</p>
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
              placeholder="Company name or ticker (e.g. Apple, MSFT)"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <select
              value={formType}
              onChange={e => { setFormType(e.target.value); setSelectedCompany(null); setFilings([]); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {FORM_TYPES.map(f => <option key={f}>{f}</option>)}
            </select>
          </div>
          <button
            type="submit"
            disabled={!query.trim() || searchLoading}
            className="mt-2 w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {searchLoading ? "Searching..." : "Search Companies"}
          </button>
        </form>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}

          {/* Step 1: company list */}
          {!selectedCompany && companies.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">Select a company</p>
              <ul className="space-y-1.5">
                {companies.map(c => (
                  <li key={c.cik}>
                    <button
                      onClick={() => handleSelectCompany(c)}
                      className="w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                    >
                      <div>
                        <span className="text-sm font-medium text-gray-900">{c.name}</span>
                        {c.ticker && <span className="ml-2 text-xs text-gray-500 font-mono">{c.ticker}</span>}
                      </div>
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Step 2: filings for selected company */}
          {selectedCompany && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => { setSelectedCompany(null); setFilings([]); setError(null); }}
                  className="text-xs text-blue-600 hover:underline"
                >← Back</button>
                <span className="text-xs text-gray-500">
                  {formType} filings for <strong className="text-gray-700">{selectedCompany.name}</strong>
                </span>
              </div>

              {filingsLoading && (
                <p className="text-sm text-gray-500 text-center py-4">Loading filings...</p>
              )}

              {!filingsLoading && filings.length > 0 && (
                <ul className="space-y-1.5">
                  {filings.map(f => {
                    const added = alreadyAdded.includes(f.accessionNo);
                    return (
                      <li key={f.accessionNo} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-gray-200 hover:border-blue-200 hover:bg-blue-50 transition-colors">
                        <div>
                          <span className="text-sm font-medium text-gray-900">{formType}</span>
                          <span className="ml-2 text-xs text-gray-500">Filed {f.filingDate}</span>
                        </div>
                        <button
                          onClick={() => handleAdd(f)}
                          disabled={added}
                          className="flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-default"
                        >
                          {added ? "Added" : "Add"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {!searchLoading && !filingsLoading && companies.length === 0 && !error && (
            <p className="text-sm text-gray-400 text-center py-8">Search for a company above to browse SEC filings.</p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="w-full text-sm text-gray-600 hover:text-gray-900 py-1">Done</button>
        </div>
      </div>
    </div>
  );
}
