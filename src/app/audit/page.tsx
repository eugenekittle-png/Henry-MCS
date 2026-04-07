"use client";

import { useState, useEffect, useCallback } from "react";

interface AuditLog {
  id: number;
  created_at: string;
  username: string | null;
  action: string;
  client_number: string | null;
  matter_number: string | null;
  details: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  success: number;
  ip_address: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  change_password: "Change Password",
  summarize: "Summarize",
  breakdown: "Breakdown",
  compare: "Compare (AI)",
  compare_diff: "Compare (Diff)",
  chat: "Assist",
  assist: "Assist",
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
  login: "bg-blue-100 text-blue-800",
  logout: "bg-gray-100 text-gray-700",
  change_password: "bg-yellow-100 text-yellow-800",
  summarize: "bg-purple-100 text-purple-800",
  breakdown: "bg-purple-100 text-purple-800",
  compare: "bg-purple-100 text-purple-800",
  compare_diff: "bg-purple-100 text-purple-800",
  chat: "bg-indigo-100 text-indigo-800",
  assist: "bg-indigo-100 text-indigo-800",
  user_create: "bg-green-100 text-green-800",
  user_update: "bg-amber-100 text-amber-800",
  user_delete: "bg-red-100 text-red-800",
  client_create: "bg-green-100 text-green-800",
  client_update: "bg-amber-100 text-amber-800",
  client_delete: "bg-red-100 text-red-800",
  matter_update: "bg-amber-100 text-amber-800",
  matter_delete: "bg-red-100 text-red-800",
};

const PAGE_SIZE = 100;

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterSuccess, setFilterSuccess] = useState<"" | "1" | "0">("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchLogs = useCallback(async (off: number) => {
    setLoading(true);
    const res = await fetch(`/api/audit?limit=${PAGE_SIZE}&offset=${off}`);
    const data = await res.json();
    setLogs(data.logs);
    setTotal(data.total);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs(offset);
  }, [fetchLogs, offset]);

  const filtered = logs.filter((log) => {
    if (filterAction && log.action !== filterAction) return false;
    if (filterUser && !(log.username ?? "").toLowerCase().includes(filterUser.toLowerCase())) return false;
    if (filterSuccess !== "" && String(log.success) !== filterSuccess) return false;
    return true;
  });

  const uniqueActions = Array.from(new Set(logs.map((l) => l.action))).sort();

  function formatDate(dateStr: string) {
    return new Date(dateStr + "Z").toLocaleString(undefined, { timeZoneName: "short" });
  }

  function parseDetails(raw: string | null) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          <p className="text-gray-600 text-sm mt-1">{total.toLocaleString()} total events</p>
        </div>
        <button
          onClick={() => fetchLogs(offset)}
          className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="Filter by user..."
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 w-48"
        />
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
        >
          <option value="">All actions</option>
          {uniqueActions.map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
          ))}
        </select>
        <select
          value={filterSuccess}
          onChange={(e) => setFilterSuccess(e.target.value as "" | "1" | "0")}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
        >
          <option value="">All results</option>
          <option value="1">Success</option>
          <option value="0">Failed</option>
        </select>
        {(filterAction || filterUser || filterSuccess) && (
          <button
            onClick={() => { setFilterAction(""); setFilterUser(""); setFilterSuccess(""); }}
            className="text-sm text-gray-500 hover:text-gray-700 px-2"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="px-4 py-10 text-center text-gray-500 text-sm">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-700 w-44">Date / Time</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700 w-28">User</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700 w-36">Action</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700 w-28">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700 w-28">Matter</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700 w-32">IP Address</th>
                <th className="text-left px-4 py-3 font-medium text-gray-700">Details</th>
                <th className="text-right px-4 py-3 font-medium text-gray-700 w-32">Tokens In / Out</th>
                <th className="text-center px-4 py-3 font-medium text-gray-700 w-20">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => {
                const details = parseDetails(log.details);
                const isExpanded = expandedId === log.id;
                return (
                  <tr
                    key={log.id}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  >
                    <td className="px-4 py-3 text-gray-600 text-xs font-mono whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-mono text-xs">
                      {log.username ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[log.action.toLowerCase()] ?? "bg-gray-100 text-gray-700"}`}>
                        {ACTION_LABELS[log.action.toLowerCase()] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs font-mono">
                      {log.client_number ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs font-mono">
                      {log.matter_number ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs font-mono">
                      {log.ip_address ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {details ? (
                        isExpanded ? (
                          <pre className="whitespace-pre-wrap text-xs text-gray-700 bg-gray-50 rounded p-2 mt-1">
                            {JSON.stringify(details, null, 2)}
                          </pre>
                        ) : (
                          <span className="truncate block max-w-xs">
                            {typeof details === "object"
                              ? Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(", ")
                              : String(details)}
                          </span>
                        )
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-gray-600 font-mono whitespace-nowrap">
                      {log.tokens_input != null ? (
                        <span>
                          <span className="text-blue-600">{log.tokens_input.toLocaleString()}</span>
                          {" / "}
                          <span className="text-green-600">{(log.tokens_output ?? 0).toLocaleString()}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${log.success ? "bg-green-500" : "bg-red-500"}`} title={log.success ? "Success" : "Failed"} />
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500">No logs found</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
