"use client";

import { useState, useEffect, useCallback } from "react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
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
  action: string;
  client_number: string | null;
  matter_number: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  success: number;
}

type GroupBy = "action" | "client" | "matter" | "log";

const INPUT_COST_PER_M = 3.0;
const OUTPUT_COST_PER_M = 15.0;

const ACTION_LABELS: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  change_password: "Change Password",
  summarize: "Summarize",
  breakdown: "Breakdown",
  compare: "Compare (AI)",
  "compare-diff": "Compare (Diff)",
  compare_diff: "Compare (Diff)",
  assist: "Assist",
  chat: "Chat",
  ask: "Ask (Word)",
  user_create: "Create User",
  user_update: "Update User",
  user_delete: "Delete User",
  client_create: "Create Client",
  client_update: "Update Client",
  client_delete: "Delete Client",
  matter_update: "Update Matter",
  matter_delete: "Delete Matter",
};

const ACTION_COLORS: Record<string, string> = {
  assist: "bg-indigo-100 text-indigo-700",
  chat: "bg-indigo-100 text-indigo-700",
  ask: "bg-indigo-100 text-indigo-700",
  breakdown: "bg-green-100 text-green-700",
  compare: "bg-purple-100 text-purple-700",
  "compare-diff": "bg-purple-100 text-purple-700",
  compare_diff: "bg-purple-100 text-purple-700",
  summarize: "bg-amber-100 text-amber-700",
  login: "bg-gray-100 text-gray-600",
  logout: "bg-gray-100 text-gray-600",
  change_password: "bg-gray-100 text-gray-600",
};

// Colors for pie chart slices — matches action badge colors where possible
const PIE_PALETTE = [
  "#6366f1", // indigo  (assist)
  "#22c55e", // green   (breakdown)
  "#a855f7", // purple  (compare)
  "#f59e0b", // amber   (summarize)
  "#3b82f6", // blue
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#64748b", // slate
  "#84cc16", // lime
];

const TABS: { id: GroupBy; label: string }[] = [
  { id: "action", label: "By Action" },
  { id: "client", label: "By Client" },
  { id: "matter", label: "By Client / Matter" },
  { id: "log", label: "Request Log" },
];

const COL_HEADERS: Record<Exclude<GroupBy, "log">, string> = {
  action: "Action",
  client: "Client",
  matter: "Client / Matter",
};

function calcCost(input: number, output: number) {
  return (input / 1_000_000) * INPUT_COST_PER_M + (output / 1_000_000) * OUTPUT_COST_PER_M;
}

function fmtCost(n: number) {
  if (n < 0.01 && n > 0) return "< $0.01";
  return `$${n.toFixed(2)}`;
}

function fmt(n: number) {
  return n.toLocaleString();
}

function fmtDateTime(iso: string) {
  const d = new Date(iso.includes("T") ? iso : iso + "Z");
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function ActionBadge({ action }: { action: string }) {
  const key = action.toLowerCase();
  const label = ACTION_LABELS[key] ?? action;
  const color = ACTION_COLORS[key] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

function UserAvatar({ username }: { username: string }) {
  const initials = username
    .split(/[\s._-]/)
    .map(p => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
      {initials || username[0]?.toUpperCase() || "U"}
    </div>
  );
}

interface DateFilterProps {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onApply: () => void;
  onClear: () => void;
}

function DateFilter({ from, to, onFrom, onTo, onApply, onClear }: DateFilterProps) {
  return (
    <form
      onSubmit={e => { e.preventDefault(); onApply(); }}
      className="flex flex-wrap items-end gap-3 bg-white rounded-xl px-4 py-3 shadow-sm"
    >
      <div>
        <label className="block text-xs text-gray-500 mb-1">From</label>
        <input
          type="date"
          value={from}
          onChange={e => onFrom(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">To</label>
        <input
          type="date"
          value={to}
          onChange={e => onTo(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <button
        type="submit"
        className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
      >
        Filter
      </button>
      {(from || to) && (
        <button
          type="button"
          onClick={onClear}
          className="text-sm text-gray-500 hover:text-gray-700 px-2"
        >
          Clear
        </button>
      )}
    </form>
  );
}

function UsagePieChart({ rows, groupBy }: { rows: UsageRow[]; groupBy: Exclude<GroupBy, "log"> }) {
  const data = rows
    .map(r => ({
      name: groupBy === "action" ? (ACTION_LABELS[r.label.toLowerCase()] ?? r.label) : r.label,
      cost: parseFloat(calcCost(r.total_input, r.total_output).toFixed(4)),
      requests: r.total_requests,
    }))
    .filter(r => r.cost > 0 || r.requests > 0);

  if (data.length === 0) return null;

  // Decide whether to show cost or request pie
  const hasCost = data.some(d => d.cost > 0);
  const pieKey = hasCost ? "cost" : "requests";
  const pieLabel = hasCost ? "Cost" : "Requests";

  return (
    <div className="bg-white rounded-xl p-4 mb-4 shadow-md">
      <p className="text-sm font-medium text-gray-700 mb-4">
        {pieLabel} by {COL_HEADERS[groupBy]}
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey={pieKey}
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={90}
            innerRadius={48}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => {
              const n = Number(value);
              return hasCost ? fmtCost(n) : fmt(n);
            }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(value) => (
              <span className="text-xs text-gray-600">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function MyUsagePage() {
  const [groupBy, setGroupBy] = useState<GroupBy>("action");
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [logRows, setLogRows] = useState<LogRow[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchAggregated = useCallback((g: GroupBy, f: string, t: string) => {
    setLoading(true);
    const params = new URLSearchParams({ groupBy: g });
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    fetch(`/api/my-usage?${params}`)
      .then(r => r.json())
      .then(d => {
        setRows(d.rows ?? []);
        setUsername(d.username ?? "");
        setLoading(false);
      });
  }, []);

  const fetchLog = useCallback((f: string, t: string, page: number) => {
    setLoading(true);
    const params = new URLSearchParams({ groupBy: "log", page: String(page) });
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    fetch(`/api/my-usage?${params}`)
      .then(r => r.json())
      .then(d => {
        setLogRows(d.rows ?? []);
        setLogTotal(d.total ?? 0);
        setLogPage(d.page ?? 0);
        setUsername(d.username ?? "");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (groupBy === "log") fetchLog(from, to, 0);
    else fetchAggregated(groupBy, from, to);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy]);

  function handleApply() {
    if (groupBy === "log") fetchLog(from, to, 0);
    else fetchAggregated(groupBy, from, to);
  }

  function handleClear() {
    setFrom("");
    setTo("");
    if (groupBy === "log") fetchLog("", "", 0);
    else fetchAggregated(groupBy, "", "");
  }

  function handleRefresh() {
    if (groupBy === "log") fetchLog(from, to, logPage);
    else fetchAggregated(groupBy, from, to);
  }

  const totals = rows.reduce(
    (acc, r) => ({
      total_requests: acc.total_requests + r.total_requests,
      total_input: acc.total_input + r.total_input,
      total_output: acc.total_output + r.total_output,
    }),
    { total_requests: 0, total_input: 0, total_output: 0 }
  );

  const totalCost = calcCost(totals.total_input, totals.total_output);
  const displayLabel = (row: UsageRow) =>
    groupBy === "action" ? (ACTION_LABELS[row.label.toLowerCase()] ?? row.label) : row.label;

  const logLimit = 100;
  const logPageCount = Math.max(1, Math.ceil(logTotal / logLimit));

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          {username && <UserAvatar username={username} />}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Usage</h1>
            {username && <p className="text-gray-500 text-sm">{username}</p>}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (groupBy === "log") {
                downloadCSV("my-usage-log.csv", logRows.map(r => ({
                  ...r,
                  created_at: fmtDateTime(r.created_at),
                  action: ACTION_LABELS[r.action.toLowerCase()] ?? r.action,
                  cost: fmtCost(calcCost(r.tokens_input ?? 0, r.tokens_output ?? 0)),
                  success: r.success ? "OK" : "Failed",
                })), [
                  { key: "created_at", label: "Date & Time" },
                  { key: "action", label: "Action" },
                  { key: "client_number", label: "Client" },
                  { key: "matter_number", label: "Matter" },
                  { key: "tokens_input", label: "In Tokens" },
                  { key: "tokens_output", label: "Out Tokens" },
                  { key: "cost", label: "Cost" },
                  { key: "success", label: "Status" },
                ]);
              } else {
                downloadCSV(`my-usage-by-${groupBy}.csv`, rows.map(r => ({
                  label: displayLabel(r),
                  total_requests: r.total_requests,
                  total_input: r.total_input,
                  total_output: r.total_output,
                  cost: fmtCost(calcCost(r.total_input, r.total_output)),
                })), [
                  { key: "label", label: groupBy === "action" ? "Action" : groupBy === "client" ? "Client" : "Client / Matter" },
                  { key: "total_requests", label: "Requests" },
                  { key: "total_input", label: "Input Tokens" },
                  { key: "total_output", label: "Output Tokens" },
                  { key: "cost", label: "Est. Cost" },
                ]);
              }
            }}
            className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            Download CSV
          </button>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {groupBy !== "log" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 flex items-start gap-3 shadow-md">
            <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Total Requests</p>
              <p className="text-2xl font-bold text-gray-900">{fmt(totals.total_requests)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 flex items-start gap-3 shadow-md">
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Input Tokens</p>
              <p className="text-2xl font-bold text-blue-600">{fmt(totals.total_input)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 flex items-start gap-3 shadow-md">
            <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8v8m0 0l4-4m-4 4l-4-4" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Output Tokens</p>
              <p className="text-2xl font-bold text-green-600">{fmt(totals.total_output)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 flex items-start gap-3 shadow-md">
            <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Estimated Cost</p>
              <p className="text-2xl font-bold text-gray-900">{fmtCost(totalCost)}</p>
            </div>
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

      {/* Date filter — all tabs */}
      <div className="mb-4">
        <DateFilter
          from={from}
          to={to}
          onFrom={setFrom}
          onTo={setTo}
          onApply={handleApply}
          onClear={handleClear}
        />
      </div>

      {/* Request Log view */}
      {groupBy === "log" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{fmt(logTotal)} record{logTotal !== 1 ? "s" : ""}</span>
          </div>

          <div className="bg-white rounded-xl overflow-hidden shadow-md">
            {loading ? (
              <div className="px-4 py-10 text-center text-gray-500 text-sm">Loading...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Date & Time</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Action</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Matter</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">In Tokens</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Out Tokens</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-600">Cost</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logRows.map(r => {
                      const cost = calcCost(r.tokens_input ?? 0, r.tokens_output ?? 0);
                      return (
                        <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/70">
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                          <td className="px-4 py-2.5"><ActionBadge action={r.action} /></td>
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
                              <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                                OK
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 text-xs font-medium px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                                Failed
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {logRows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-gray-400">No requests found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {logPageCount > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>Page {logPage + 1} of {logPageCount}</span>
              <div className="flex gap-2">
                <button
                  disabled={logPage === 0}
                  onClick={() => { const p = logPage - 1; setLogPage(p); fetchLog(from, to, p); }}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default"
                >
                  Previous
                </button>
                <button
                  disabled={logPage >= logPageCount - 1}
                  onClick={() => { const p = logPage + 1; setLogPage(p); fetchLog(from, to, p); }}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Pie chart */}
          {!loading && rows.length > 0 && (
            <UsagePieChart rows={rows} groupBy={groupBy as Exclude<GroupBy, "log">} />
          )}

          {/* Aggregated table */}
          <div className="bg-white rounded-xl overflow-hidden shadow-md">
            {loading ? (
              <div className="px-4 py-10 text-center text-gray-500 text-sm">Loading...</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">{COL_HEADERS[groupBy as Exclude<GroupBy, "log">]}</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Requests</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Input Tokens</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Output Tokens</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Est. Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const cost = calcCost(r.total_input, r.total_output);
                    return (
                      <tr key={r.label} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/70">
                        <td className="px-4 py-3">
                          {groupBy === "action" ? (
                            <ActionBadge action={r.label} />
                          ) : (
                            <span className="text-gray-900">{displayLabel(r)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmt(r.total_requests)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-blue-600">
                          {r.total_input > 0 ? fmt(r.total_input) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-green-600">
                          {r.total_output > 0 ? fmt(r.total_output) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {cost > 0 ? fmtCost(cost) : <span className="text-gray-400 font-normal">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length > 1 && (
                    <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                      <td className="px-4 py-3 text-gray-700 text-sm">Total</td>
                      <td className="px-4 py-3 text-right text-gray-700">{fmt(totals.total_requests)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-blue-600">{fmt(totals.total_input)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-green-600">{fmt(totals.total_output)}</td>
                      <td className="px-4 py-3 text-right text-gray-900">{fmtCost(totalCost)}</td>
                    </tr>
                  )}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-gray-400">No usage data yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4 text-center">
        Pricing based on Claude Sonnet 4.6 — ${INPUT_COST_PER_M.toFixed(2)}/M input tokens, ${OUTPUT_COST_PER_M.toFixed(2)}/M output tokens
      </p>
    </div>
  );
}
