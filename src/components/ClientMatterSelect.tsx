"use client";

import { useState, useRef } from "react";
import type { Client, Matter } from "@/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ClientMatterSelectProps {
  onSelect: (client: Client, matter: Matter) => void;
  onClear: () => void;
}

export default function ClientMatterSelect({
  onSelect,
  onClear,
}: ClientMatterSelectProps) {
  const [clientSearch, setClientSearch] = useState("");
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [showClientResults, setShowClientResults] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const [matterSearch, setMatterSearch] = useState("");
  const [matterResults, setMatterResults] = useState<Matter[]>([]);
  const [matterLoading, setMatterLoading] = useState(false);
  const [showMatterResults, setShowMatterResults] = useState(false);
  const [selectedMatter, setSelectedMatter] = useState<Matter | null>(null);

  const clientTimer = useRef<any>(null);
  const matterTimer = useRef<any>(null);

  function handleClientInput(value: string) {
    setClientSearch(value);
    setShowClientResults(true);
    clearTimeout(clientTimer.current);
    if (value.length < 1) { setClientResults([]); return; }
    clientTimer.current = setTimeout(() => {
      setClientLoading(true);
      fetch(`/api/clients?search=${encodeURIComponent(value)}`)
        .then(r => r.ok ? r.json() : [])
        .then(data => setClientResults(data))
        .catch(() => {})
        .finally(() => setClientLoading(false));
    }, 300);
  }

  function handleSelectClient(client: Client) {
    setSelectedClient(client);
    setClientSearch("");
    setClientResults([]);
    setShowClientResults(false);
    setSelectedMatter(null);
    setMatterSearch("");
    setMatterResults([]);
    onClear();
  }

  function handleClearClient() {
    setSelectedClient(null);
    setClientSearch("");
    setClientResults([]);
    setSelectedMatter(null);
    setMatterSearch("");
    setMatterResults([]);
    onClear();
  }

  function handleMatterInput(value: string) {
    setMatterSearch(value);
    setShowMatterResults(true);
    clearTimeout(matterTimer.current);
    if (value.length < 1) { setMatterResults([]); return; }
    matterTimer.current = setTimeout(() => {
      if (!selectedClient) return;
      setMatterLoading(true);
      fetch(`/api/clients/${selectedClient.id}/matters?search=${encodeURIComponent(value)}`)
        .then(r => r.ok ? r.json() : [])
        .then(data => setMatterResults(data))
        .catch(() => {})
        .finally(() => setMatterLoading(false));
    }, 300);
  }

  function handleSelectMatter(matter: Matter) {
    setSelectedMatter(matter);
    setMatterSearch("");
    setMatterResults([]);
    setShowMatterResults(false);
    if (selectedClient) {
      onSelect(selectedClient, matter);
    }
  }

  function handleClearMatter() {
    setSelectedMatter(null);
    setMatterSearch("");
    setMatterResults([]);
    onClear();
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-medium text-gray-700">Client &amp; Matter</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Client */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Client</label>
          <div className="relative">
            {selectedClient ? (
              <div className="flex items-center gap-1.5 border border-blue-300 bg-blue-50 rounded-lg px-3 py-2">
                <span className="text-sm text-blue-800 truncate flex-1">
                  {selectedClient.client_number} — {selectedClient.name}
                </span>
                <button
                  onClick={handleClearClient}
                  className="text-blue-400 hover:text-blue-600 flex-shrink-0 leading-none text-base"
                >×</button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={clientSearch}
                  onChange={e => handleClientInput(e.target.value)}
                  onFocus={() => clientSearch.length >= 1 && setShowClientResults(true)}
                  onBlur={() => setTimeout(() => setShowClientResults(false), 150)}
                  placeholder="Search client..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {showClientResults && (clientResults.length > 0 || clientLoading) && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                    {clientLoading && (
                      <div className="px-3 py-2 text-sm text-gray-400">Searching...</div>
                    )}
                    {clientResults.map(c => (
                      <button
                        key={c.id}
                        onMouseDown={() => handleSelectClient(c)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-blue-50 truncate"
                      >
                        {c.client_number} — {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Matter */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Matter</label>
          <div className="relative">
            {selectedMatter ? (
              <div className="flex items-center gap-1.5 border border-blue-300 bg-blue-50 rounded-lg px-3 py-2">
                <span className="text-sm text-blue-800 truncate flex-1">
                  {selectedMatter.matter_number} — {selectedMatter.description}
                </span>
                <button
                  onClick={handleClearMatter}
                  className="text-blue-400 hover:text-blue-600 flex-shrink-0 leading-none text-base"
                >×</button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={matterSearch}
                  onChange={e => handleMatterInput(e.target.value)}
                  onFocus={() => matterSearch.length >= 1 && setShowMatterResults(true)}
                  onBlur={() => setTimeout(() => setShowMatterResults(false), 150)}
                  placeholder={selectedClient ? "Search matter..." : "Select client first"}
                  disabled={!selectedClient}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                />
                {showMatterResults && (matterResults.length > 0 || matterLoading) && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                    {matterLoading && (
                      <div className="px-3 py-2 text-sm text-gray-400">Searching...</div>
                    )}
                    {matterResults.map(m => (
                      <button
                        key={m.id}
                        onMouseDown={() => handleSelectMatter(m)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-blue-50 truncate"
                      >
                        {m.matter_number} — {m.description}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
