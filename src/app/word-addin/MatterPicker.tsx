"use client";

import { useRef, useState } from "react";

export type ClientRow = { id: number; client_number: string; name: string };
export type MatterRow = { id: number; matter_number: string; description: string };

interface Props {
  authHeaders: () => HeadersInit;
  client: ClientRow | null;
  matter: MatterRow | null;
  onChange: (client: ClientRow | null, matter: MatterRow | null) => void;
}

/**
 * Compact client/matter context. Collapsed to a one-line chip once both are chosen;
 * click it to change.
 */
export default function MatterPicker({ authHeaders, client, matter, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [clientResults, setClientResults] = useState<ClientRow[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [showClients, setShowClients] = useState(false);
  const [matterSearch, setMatterSearch] = useState("");
  const [matterResults, setMatterResults] = useState<MatterRow[]>([]);
  const [matterLoading, setMatterLoading] = useState(false);
  const [showMatters, setShowMatters] = useState(false);
  const clientTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const matterTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function fetchClients(search: string) {
    setClientLoading(true);
    const qs = search ? `search=${encodeURIComponent(search)}` : "limit=10";
    fetch(`/api/clients?${qs}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(setClientResults)
      .catch(() => {})
      .finally(() => setClientLoading(false));
  }

  function fetchMatters(clientId: number, search: string) {
    setMatterLoading(true);
    const qs = search ? `search=${encodeURIComponent(search)}` : "limit=10";
    fetch(`/api/clients/${clientId}/matters?${qs}`, { headers: authHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(setMatterResults)
      .catch(() => {})
      .finally(() => setMatterLoading(false));
  }

  function onClientInput(value: string) {
    setClientSearch(value);
    setShowClients(true);
    clearTimeout(clientTimer.current);
    clientTimer.current = setTimeout(() => fetchClients(value), value ? 300 : 0);
  }

  function onMatterInput(value: string) {
    if (!client) return;
    setMatterSearch(value);
    setShowMatters(true);
    clearTimeout(matterTimer.current);
    matterTimer.current = setTimeout(() => fetchMatters(client.id, value), value ? 300 : 0);
  }

  // Always expanded until both are chosen
  if (!open && client && matter) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left px-3 py-1.5 bg-white border-b border-gray-100 flex items-center gap-1.5 hover:bg-gray-50 flex-shrink-0"
        title="Change client / matter"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
        <span className="text-[11px] text-gray-600 truncate flex-1">
          <span className="font-medium text-gray-800">{client.name}</span>
          <span className="text-gray-400"> · </span>
          {matter.matter_number} {matter.description}
        </span>
        <span className="text-[11px] text-blue-600 flex-shrink-0">Change</span>
      </button>
    );
  }

  const inputCls = "w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-50";
  const listCls = "absolute top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded-md shadow-lg z-30 max-h-44 overflow-y-auto";
  const chipCls = "flex items-center gap-1 border border-blue-200 bg-blue-50 rounded-md px-2 py-1.5";

  return (
    <div className="px-3 py-2 bg-white border-b border-gray-100 space-y-1.5 flex-shrink-0">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Client &amp; matter</p>
        {client && matter && (
          <button onClick={() => setOpen(false)} className="text-[11px] text-blue-600 hover:text-blue-800">Done</button>
        )}
      </div>

      <div className="relative">
        {client ? (
          <div className={chipCls}>
            <span className="text-xs text-blue-800 truncate flex-1">{client.client_number} - {client.name}</span>
            <button onClick={() => { onChange(null, null); setClientSearch(""); setMatterResults([]); }} className="text-blue-400 hover:text-blue-600 leading-none">×</button>
          </div>
        ) : (
          <>
            <input
              type="text" value={clientSearch} placeholder="Search client…" className={inputCls}
              onChange={e => onClientInput(e.target.value)}
              onFocus={() => { setShowClients(true); if (!clientSearch && clientResults.length === 0) fetchClients(""); }}
              onBlur={() => setTimeout(() => setShowClients(false), 150)}
            />
            {showClients && (clientResults.length > 0 || clientLoading) && (
              <div className={listCls}>
                {clientLoading && <div className="px-2 py-1.5 text-xs text-gray-400">Searching…</div>}
                {clientResults.map(c => (
                  <button key={c.id} onMouseDown={() => { onChange(c, null); setClientSearch(""); setClientResults([]); setMatterResults([]); setShowClients(false); }}
                    className="w-full text-left px-2 py-1.5 text-xs text-gray-800 hover:bg-blue-50 truncate">
                    {c.client_number} - {c.name}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="relative">
        {matter ? (
          <div className={chipCls}>
            <span className="text-xs text-blue-800 truncate flex-1">{matter.matter_number} - {matter.description}</span>
            <button onClick={() => { onChange(client, null); setMatterSearch(""); }} className="text-blue-400 hover:text-blue-600 leading-none">×</button>
          </div>
        ) : (
          <>
            <input
              type="text" value={matterSearch} disabled={!client} className={inputCls}
              placeholder={client ? "Search matter…" : "Select a client first"}
              onChange={e => onMatterInput(e.target.value)}
              onFocus={() => { if (!client) return; setShowMatters(true); if (!matterSearch && matterResults.length === 0) fetchMatters(client.id, ""); }}
              onBlur={() => setTimeout(() => setShowMatters(false), 150)}
            />
            {showMatters && (matterResults.length > 0 || matterLoading) && (
              <div className={listCls}>
                {matterLoading && <div className="px-2 py-1.5 text-xs text-gray-400">Searching…</div>}
                {matterResults.map(m => (
                  <button key={m.id} onMouseDown={() => { onChange(client, m); setMatterSearch(""); setMatterResults([]); setShowMatters(false); setOpen(false); }}
                    className="w-full text-left px-2 py-1.5 text-xs text-gray-800 hover:bg-blue-50 truncate">
                    {m.matter_number} - {m.description}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
