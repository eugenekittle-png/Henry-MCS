"use client";

import { useState, useEffect, useCallback } from "react";
import type { Client, Matter } from "@/types";

interface ClientMatterSelectProps {
  onSelect: (client: Client, matter: Matter) => void;
  onClear: () => void;
}

export default function ClientMatterSelect({
  onSelect,
  onClear,
}: ClientMatterSelectProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedMatterId, setSelectedMatterId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/clients")
      .then((res) => res.json())
      .then((data) => {
        setClients(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleClientChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const clientId = e.target.value;
      setSelectedClientId(clientId);
      setSelectedMatterId("");
      setMatters([]);
      onClear();

      if (!clientId) return;

      fetch(`/api/clients/${clientId}/matters`)
        .then((res) => res.json())
        .then((data) => setMatters(data));
    },
    [onClear]
  );

  const handleMatterChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const matterId = e.target.value;
      setSelectedMatterId(matterId);

      if (!matterId) {
        onClear();
        return;
      }

      const client = clients.find((c) => c.id === parseInt(selectedClientId));
      const matter = matters.find((m) => m.id === parseInt(matterId));
      if (client && matter) {
        onSelect(client, matter);
      }
    },
    [clients, matters, selectedClientId, onSelect, onClear]
  );

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-sm text-gray-500">Loading clients...</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-medium text-gray-700">Client &amp; Matter</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="client-select" className="block text-xs text-gray-500 mb-1">
            Client
          </label>
          <select
            id="client-select"
            value={selectedClientId}
            onChange={handleClientChange}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a client...</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.client_number} — {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="matter-select" className="block text-xs text-gray-500 mb-1">
            Matter
          </label>
          <select
            id="matter-select"
            value={selectedMatterId}
            onChange={handleMatterChange}
            disabled={!selectedClientId}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
          >
            <option value="">
              {selectedClientId ? "Select a matter..." : "Select a client first"}
            </option>
            {matters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.matter_number} — {m.description}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
