"use client";

import { useState, useEffect, useCallback } from "react";
import { downloadCSV } from "@/lib/csv";

interface UsageRow {
  label: string;
  total_requests: number;
  ai_requests: number;
  total_input: number;
  total_output: number;
}

interface LogRow {
  id: number;
  created_at: string;
  username: string | null;
  action: string;
  client_number: string | null;
  matter_number: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  success: number;
}

type GroupBy = "user" | "client" | "matter" | "log";

// Claude Sonnet 4.6 pricing
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
  assist: "Assist",
  chat: "Chat",
  user_create: "Create User",
  user_update: "Update User",
  user_delete: "Delete User",
  "createtemplate (word)": "CreateTemplate (Word)",
  "renamevariable (word)": "RenameVariable (Word)",
  "deletevariable (word)": "DeleteVariable (Word)",
  "ask (word)": "Ask (Word)",
};

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

function fmtDateTime(iso: string) {
  // SQLite stores as "YYYY-MM-DD HH:MM:SS" UTC
  const d = new Date(iso.includes("T") ? iso : iso + "Z");
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

const TABS: { id: GroupBy; label: string }[] = [
  { id: "user", label: "By User" },
  { id: "client", label: "By Client" },
  { id: "matter", label: "By Client / Matter" },
  { id: "log", label: "Request Log" },
];

const COL_HEADERS: Record<Exclude<GroupBy, "log">, string> = {
  user: "User",
  client: "Client",
  matter: "Client / Matter",
};

export default function UsagePage() {
  const [groupBy, setGroupBy] = useState<GroupBy>("user");
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [logRows, setLogRows] = useState<LogRow[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(0);
  const [logFrom, setLogFrom] = useState("");
  const [logTo, setLogTo] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchAggregated = useCallback((g: GroupBy) => {
    setLoading(true);
    fetch(`/api/usage?groupBy=${g}`)
      .then(r => r.json())
      .then(d => { setRows(d.rows ?? []); setLoading(false); });
  }, []);

  const fetchLog = useCallback((from: string, to: string, page: number) => {
    setLoading(true);
    const params = new URLSearchParams({ groupBy: "log", page: String(page) });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    fetch(`/api/usage?${params}`)
      .then(r => r.json())
      .then(d => {
        setLogRows(d.rows ?? []);
        setLogTotal(d.total ?? 0);
        setLogPage(d.page ?? 0);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (groupBy === "log") {
      fetchLog(logFrom, logTo, 0);
    } else {
      fetchAggregated(groupBy);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy]);

  function handleRefresh() {
    if (groupBy === "log") fetchLog(logFrom, logTo, logPage);
    else fetchAggregated(groupBy);
  }

  function handleLogFilter(e: React.FormEvent) {
    e.preventDefault();
    fetchLog(logFrom, logTo, 0);
  }

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
  const logLimit = 100;
  const logPageCount = Math.max(1, Math.ceil(logTotal / logLimit));

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usage & Cost</h1>
          <p className="text-gray-600 text-sm mt-1">
            Claude Sonnet 4.6 — ${INPUT_COST_PER_M.toFixed(2)}/M input tokens, ${OUTPUT_COST_PER_M.toFixed(2)}/M output tokens
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (groupBy === "log") {
                downloadCSV("usage-log.csv", logRows.map(r => ({
                  ...r,
                  created_at: fmtDateTime(r.created_at),
                  action: ACTION_LABELS[r.action] ?? r.action,
                  cost: fmtCost(calcCost(r.tokens_input ?? 0, r.tokens_output ?? 0)),
                  success: r.success ? "OK" : "Failed",
                })), [
                  { key: "created_at", label: "Date & Time" },
                  { key: "username", label: "User" },
                  { key: "action", label: "Action" },
                  { key: "client_number", label: "Client" },
                  { key: "matter_number", label: "Matter" },
                  { key: "tokens_input", label: "In Tokens" },
                  { key: "tokens_output", label: "Out Tokens" },
                  { key: "cost", label: "Cost" },
                  { key: "success", label: "Status" },
                ]);
              } else {
                downloadCSV(`usage-by-${groupBy}.csv`, rows.map(r => ({
                  label: r.label,
                  total_requests: r.total_requests,
                  ai_requests: r.ai_requests,
                  total_input: r.total_input,
                  total_output: r.total_output,
                  input_cost: fmtCost((r.total_input / 1_000_000) * INPUT_COST_PER_M),
                  output_cost: fmtCost((r.total_output / 1_000_000) * OUTPUT_COST_PER_M),
                  total_cost: fmtCost(calcCost(r.total_input, r.total_output)),
                })), [
                  { key: "label", label: COL_HEADERS[groupBy as Exclude<GroupBy, "log">] },
                  { key: "total_requests", label: "Requests" },
                  { key: "ai_requests", label: "AI Requests" },
                  { key: "total_input", label: "Input Tokens" },
                  { key: "total_output", label: "Output Tokens" },
                  { key: "input_cost", label: "Input Cost" },
                  { key: "output_cost", label: "Output Cost" },
                  { key: "total_cost", label: "Total Cost" },
                ]);
              }
            }}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Download CSV
          </button>
          <button
            onClick={handleRefresh}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Summary cards — only for aggregated views */}
      {groupBy !== "log" && (
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
      )}

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

      {/* Request Log view */}
      {groupBy === "log" ? (
        <div className="space-y-4">
          {/* Date range filter */}
          <form onSubmit={handleLogFilter} className="flex flex-wrap items-end gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={logFrom}
                onChange={e => setLogFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={logTo}
                onChange={e => setLogTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Filter
            </button>
            {(logFrom || logTo) && (
              <button
                type="button"
                onClick={() => { setLogFrom(""); setLogTo(""); fetchLog("", "", 0); }}
                className="text-sm text-gray-500 hover:text-gray-700 px-2"
              >
                Clear
              </button>
            )}
            <span className="ml-auto text-xs text-gray-400">{fmt(logTotal)} record{logTotal !== 1 ? "s" : ""}</span>
          </form>

          {/* Log table */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="px-4 py-10 text-center text-gray-500 text-sm">Loading...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-medium text-gray-700 whitespace-nowrap">Date & Time</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-700">User</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-700">Action</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-700">Client</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-700">Matter</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-700">In Tokens</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-700">Out Tokens</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-700">Cost</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logRows.map(r => {
                      const cost = calcCost(r.tokens_input ?? 0, r.tokens_output ?? 0);
                      return (
                        <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-600 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-800">{r.username ?? <span className="text-gray-400">—</span>}</td>
                          <td className="px-4 py-2.5 text-xs">
                            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">{ACTION_LABELS[r.action] ?? r.action}</span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-600">{r.client_number ?? <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-2.5 text-xs text-gray-600">{r.matter_number ?? <span className="text-gray-300">—</span>}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-blue-600">
                            {r.tokens_input != null ? fmt(r.tokens_input) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-green-600">
                            {r.tokens_output != null ? fmt(r.tokens_output) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-gray-700">
                            {(r.tokens_input || r.tokens_output) ? fmtCost(cost) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {r.success ? (
                              <span className="text-xs text-green-600 font-medium">OK</span>
                            ) : (
                              <span className="text-xs text-red-500 font-medium">Failed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {logRows.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-gray-500">No requests found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {logPageCount > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Page {logPage + 1} of {logPageCount}</span>
              <div className="flex gap-2">
                <button
                  disabled={logPage === 0}
                  onClick={() => { const p = logPage - 1; setLogPage(p); fetchLog(logFrom, logTo, p); }}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default"
                >
                  Previous
                </button>
                <button
                  disabled={logPage >= logPageCount - 1}
                  onClick={() => { const p = logPage + 1; setLogPage(p); fetchLog(logFrom, logTo, p); }}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Aggregated table */
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="px-4 py-10 text-center text-gray-500 text-sm">Loading...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-700">{COL_HEADERS[groupBy as Exclude<GroupBy, "log">]}</th>
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
      )}
    </div>
  );
}
