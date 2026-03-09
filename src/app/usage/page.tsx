"use client";

import { useState, useEffect, useCallback } from "react";

interface UsageRow {
  label: string;
  total_requests: number;
  ai_requests: number;
  total_input: number;
  total_output: number;
}

type GroupBy = "user" | "client" | "matter";

// Claude Sonnet 4.6 pricing
const INPUT_COST_PER_M = 3.0;
const OUTPUT_COST_PER_M = 15.0;

function calcCost(input: number, output: number) {
  return (input / 1_000_000) * INPUT_COST_PER_M + (output / 1_000_000) * OUTPUT_COST_PER_M;
}

function fmt(n: number) {
  return n.toLocaleString();
}

function fmtCost(n: number) {
  if (n < 0.01 && n > 0) return "< $0.01";
  return `$${n.toFixed(2)}`;
}

const TABS: { id: GroupBy; label: string }[] = [
  { id: "user", label: "By User" },
  { id: "client", label: "By Client" },
  { id: "matter", label: "By Client / Matter" },
];

const COL_HEADERS: Record<GroupBy, string> = {
  user: "User",
  client: "Client",
  matter: "Client / Matter",
};

export default function UsagePage() {
  const [groupBy, setGroupBy] = useState<GroupBy>("user");
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback((g: GroupBy) => {
    setLoading(true);
    fetch(`/api/usage?groupBy=${g}`)
      .then(r => r.json())
      .then(d => { setRows(d.rows ?? []); setLoading(false); });
  }, []);

  useEffect(() => { fetchData(groupBy); }, [fetchData, groupBy]);

  const totals = rows.reduce(
    (acc, r) => ({
      total_requests: acc.total_requests + r.total_requests,
      ai_requests: acc.ai_requests + r.ai_requests,
      total_input: acc.total_input + r.total_input,
      total_output: acc.total_output + r.total_output,
    }),
    { total_requests: 0, ai_requests: 0, total_input: 0, total_output: 0 }
  );

  const totalCost = calcCost(totals.total_input, totals.total_output);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usage & Cost</h1>
          <p className="text-gray-600 text-sm mt-1">
            Claude Sonnet 4.6 — ${INPUT_COST_PER_M.toFixed(2)}/M input tokens, ${OUTPUT_COST_PER_M.toFixed(2)}/M output tokens
          </p>
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
          <p className="text-xs text-gray-500 mb-1">AI Requests</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(totals.ai_requests)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Total Tokens</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(totals.total_input + totals.total_output)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmt(totals.total_input)} in / {fmt(totals.total_output)} out</p>
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
                <th className="text-right px-4 py-3 font-medium text-gray-700">AI Requests</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Input Tokens</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Output Tokens</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Input Cost</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Output Cost</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700">Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const inputCost = (r.total_input / 1_000_000) * INPUT_COST_PER_M;
                const outputCost = (r.total_output / 1_000_000) * OUTPUT_COST_PER_M;
                const rowCost = inputCost + outputCost;
                return (
                  <tr key={r.label} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-900">{r.label}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(r.total_requests)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(r.ai_requests)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-blue-600">{fmt(r.total_input)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-green-600">{fmt(r.total_output)}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-600">{fmtCost(inputCost)}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-600">{fmtCost(outputCost)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmtCost(rowCost)}</td>
                  </tr>
                );
              })}
              {rows.length > 1 && (
                <tr className="bg-gray-50 border-t-2 border-gray-300 font-semibold">
                  <td className="px-4 py-3 text-gray-700 text-sm">Total</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmt(totals.total_requests)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{fmt(totals.ai_requests)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-blue-600">{fmt(totals.total_input)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-green-600">{fmt(totals.total_output)}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-600">{fmtCost((totals.total_input / 1_000_000) * INPUT_COST_PER_M)}</td>
                  <td className="px-4 py-3 text-right text-xs text-gray-600">{fmtCost((totals.total_output / 1_000_000) * OUTPUT_COST_PER_M)}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{fmtCost(totalCost)}</td>
                </tr>
              )}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No usage data found</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
