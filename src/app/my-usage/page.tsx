"use client";

import { useState, useEffect, useCallback } from "react";

interface UsageRow {
  label: string;
  total_requests: number;
  ai_requests: number;
  total_input: number;
  total_output: number;
}

type GroupBy = "action" | "client" | "matter";

const INPUT_COST_PER_M = 3.0;
const OUTPUT_COST_PER_M = 15.0;

const ACTION_LABELS: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  change_password: "Change Password",
  summarize: "Summarize",
  breakdown: "Breakdown",
  compare: "Compare (AI)",
  compare_diff: "Compare (Diff)",
  chat: "Chat",
  user_create: "Create User",
  user_update: "Update User",
  user_delete: "Delete User",
  client_create: "Create Client",
  client_update: "Update Client",
  client_delete: "Delete Client",
  matter_update: "Update Matter",
  matter_delete: "Delete Matter",
};

const TABS: { id: GroupBy; label: string }[] = [
  { id: "action", label: "By Action" },
  { id: "client", label: "By Client" },
  { id: "matter", label: "By Client / Matter" },
];

const COL_HEADERS: Record<GroupBy, string> = {
  action: "Action",
  client: "Client",
  matter: "Client / Matter",
};

function fmtCost(n: number) {
  if (n < 0.01 && n > 0) return "< $0.01";
  return `$${n.toFixed(2)}`;
}

function fmt(n: number) {
  return n.toLocaleString();
}

export default function MyUsagePage() {
  const [groupBy, setGroupBy] = useState<GroupBy>("action");
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback((g: GroupBy) => {
    setLoading(true);
    fetch(`/api/my-usage?groupBy=${g}`)
      .then(r => r.json())
      .then(d => {
        setRows(d.rows ?? []);
        setUsername(d.username ?? "");
        setLoading(false);
      });
  }, []);

  useEffect(() => { fetchData(groupBy); }, [fetchData, groupBy]);

  const totals = rows.reduce(
    (acc, r) => ({
      total_requests: acc.total_requests + r.total_requests,
      total_input: acc.total_input + r.total_input,
      total_output: acc.total_output + r.total_output,
    }),
    { total_requests: 0, total_input: 0, total_output: 0 }
  );

  const totalCost = (totals.total_input / 1_000_000) * INPUT_COST_PER_M + (totals.total_output / 1_000_000) * OUTPUT_COST_PER_M;

  const displayLabel = (row: UsageRow) =>
    groupBy === "action" ? (ACTION_LABELS[row.label] ?? row.label) : row.label;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Usage</h1>
          {username && <p className="text-gray-500 text-sm mt-1">{username}</p>}
        </div>
        <button
          onClick={() => fetchData(groupBy)}
          className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Total Requests</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(totals.total_requests)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Input Tokens</p>
          <p className="text-2xl font-bold text-blue-600">{fmt(totals.total_input)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Output Tokens</p>
          <p className="text-2xl font-bold text-green-600">{fmt(totals.total_output)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Estimated Cost</p>
          <p className="text-2xl font-bold text-gray-900">{fmtCost(totalCost)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setGroupBy(tab.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              groupBy === tab.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-4 py-10 text-center text-gray-500 text-sm">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-700">{COL_HEADERS[groupBy]}</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Requests</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Input Tokens</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Output Tokens</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const cost = (r.total_input / 1_000_000) * INPUT_COST_PER_M + (r.total_output / 1_000_000) * OUTPUT_COST_PER_M;
                return (
                  <tr key={r.label} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{displayLabel(r)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(r.total_requests)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-blue-600">
                      {r.total_input > 0 ? fmt(r.total_input) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-green-600">
                      {r.total_output > 0 ? fmt(r.total_output) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {cost > 0 ? fmtCost(cost) : <span className="text-gray-400 font-normal">—</span>}
                    </td>
                  </tr>
                );
              })}
              {rows.length > 1 && (
                <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                  <td className="px-4 py-3 text-gray-700 text-sm">Total</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmt(totals.total_requests)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-blue-600">{fmt(totals.total_input)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-green-600">{fmt(totals.total_output)}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{fmtCost(totalCost)}</td>
                </tr>
              )}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No usage data yet</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-4 text-center">
        Pricing based on Claude Sonnet 4.6 — ${INPUT_COST_PER_M.toFixed(2)}/M input tokens, ${OUTPUT_COST_PER_M.toFixed(2)}/M output tokens
      </p>
    </div>
  );
}
