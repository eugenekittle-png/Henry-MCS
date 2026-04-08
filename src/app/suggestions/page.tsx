"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";

type SuggestionStatus = "Submitted" | "Reviewed" | "Developing" | "Staging" | "Production";

interface Suggestion {
  id: number;
  user_id: number;
  username: string;
  title: string;
  description: string;
  is_anonymous: number;
  status: SuggestionStatus;
  created_at: string;
  vote_count: number;
  user_vote_count: number;
}

interface HistoryEntry {
  id: number;
  status: SuggestionStatus;
  comment: string | null;
  changed_by: string;
  created_at: string;
}

const VOTE_LIMIT = 10;

const STATUS_STYLES: Record<SuggestionStatus, string> = {
  Submitted: "bg-gray-100 text-gray-700",
  Reviewed: "bg-blue-100 text-blue-700",
  Developing: "bg-yellow-100 text-yellow-700",
  Staging: "bg-orange-100 text-orange-700",
  Production: "bg-green-100 text-green-700",
};

const STATUS_TIMELINE_DOT: Record<SuggestionStatus, string> = {
  Submitted: "bg-gray-400",
  Reviewed: "bg-blue-500",
  Developing: "bg-yellow-500",
  Staging: "bg-orange-500",
  Production: "bg-green-500",
};

const ALL_STATUSES: SuggestionStatus[] = ["Submitted", "Reviewed", "Developing", "Staging", "Production"];

export default function SuggestionsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [userVotesUsed, setUserVotesUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [history, setHistory] = useState<Record<number, HistoryEntry[]>>({});
  const [historyLoading, setHistoryLoading] = useState<number | null>(null);

  const [statusEdit, setStatusEdit] = useState<{
    id: number;
    status: SuggestionStatus;
    comment: string;
    saving: boolean;
  } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [adjustingId, setAdjustingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/suggestions");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setSuggestions(data.suggestions);
      setUserVotesUsed(data.userVotesUsed ?? 0);
    } catch {
      setError("Could not load suggestions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadHistory(id: number) {
    if (history[id]) return;
    setHistoryLoading(id);
    try {
      const res = await fetch(`/api/suggestions/${id}/history`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setHistory((prev) => ({ ...prev, [id]: data.history }));
    } catch { /* silent */ }
    finally { setHistoryLoading(null); }
  }

  function handleExpand(id: number) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    loadHistory(id);
  }

  async function handleVote(id: number, action: "add" | "remove") {
    if (adjustingId) return;
    if (action === "add" && userVotesUsed >= VOTE_LIMIT) return;
    setAdjustingId(id);
    try {
      const res = await fetch(`/api/suggestions/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error();
      const { voteCount, userVoteCount, userVotesUsed: newTotal } = await res.json();
      setSuggestions((prev) =>
        prev
          .map((s) => s.id === id ? { ...s, vote_count: voteCount, user_vote_count: userVoteCount } : s)
          .sort((a, b) => b.vote_count - a.vote_count || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      );
      setUserVotesUsed(newTotal);
    } catch { /* silent */ }
    finally { setAdjustingId(null); }
  }

  async function handleStatusSave() {
    if (!statusEdit) return;
    setStatusEdit((prev) => prev && { ...prev, saving: true });
    const { id, status, comment } = statusEdit;
    const res = await fetch(`/api/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, comment }),
    });
    if (res.ok) {
      setSuggestions((prev) => prev.map((s) => s.id === id ? { ...s, status } : s));
      setHistory((prev) => { const next = { ...prev }; delete next[id]; return next; });
      if (expanded === id) loadHistory(id);
    }
    setStatusEdit(null);
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/suggestions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      if (expanded === id) setExpanded(null);
    }
    setDeleteConfirm(null);
  }

  if (!user) return null;

  const votesRemaining = VOTE_LIMIT - userVotesUsed;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Feedback Forum</h1>
          <p className="text-sm text-gray-500 mt-1">Vote on suggestions or submit your own</p>
        </div>
        <button
          onClick={() => router.push("/suggestions/new")}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Submit a Suggestion
        </button>
      </div>

      {/* Votes tally */}
      <div className={`mb-5 px-4 py-3 rounded-xl border ${
        votesRemaining === 0 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"
      }`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-700">
            <span className={`font-bold ${votesRemaining === 0 ? "text-amber-600" : "text-blue-600"}`}>
              {votesRemaining}
            </span>
            {" "}of {VOTE_LIMIT} votes remaining
          </p>
          <p className="text-xs text-gray-400">Stack votes on one idea to show stronger support</p>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${votesRemaining === 0 ? "bg-amber-400" : "bg-blue-500"}`}
            style={{ width: `${(votesRemaining / VOTE_LIMIT) * 100}%` }}
          />
        </div>
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">No suggestions yet</p>
          <p className="text-sm mt-1">Be the first to submit one</p>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => {
            const isExpanded = expanded === s.id;
            const isEditingStatus = statusEdit?.id === s.id;
            const displayName = s.is_anonymous ? "Anonymous" : s.username;
            const entries = history[s.id] ?? [];
            const canAdd = votesRemaining > 0 && adjustingId !== s.id;
            const canRemove = s.user_vote_count > 0 && adjustingId !== s.id;

            return (
              <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  {/* Vote controls */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleVote(s.id, "add")}
                      disabled={!canAdd}
                      className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${
                        canAdd
                          ? "border-blue-300 text-blue-600 hover:bg-blue-50"
                          : "border-gray-200 text-gray-300 cursor-not-allowed"
                      }`}
                      title="Add a vote"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>

                    <div className="flex flex-col items-center leading-none">
                      <span className="text-base font-bold text-gray-900">{s.vote_count}</span>
                      {s.user_vote_count > 0 && (
                        <span className="text-xs text-blue-500 font-medium">{s.user_vote_count} yours</span>
                      )}
                    </div>

                    <button
                      onClick={() => handleVote(s.id, "remove")}
                      disabled={!canRemove}
                      className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${
                        canRemove
                          ? "border-gray-300 text-gray-500 hover:border-red-300 hover:text-red-500"
                          : "border-gray-200 text-gray-200 cursor-not-allowed"
                      }`}
                      title="Remove a vote"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                      </svg>
                    </button>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <button
                        onClick={() => handleExpand(s.id)}
                        className="text-left font-medium text-gray-900 hover:text-blue-600 transition-colors"
                      >
                        {s.title}
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[s.status]} ${
                            user.role === "admin" && !isEditingStatus ? "cursor-pointer hover:opacity-80" : ""
                          }`}
                          onClick={() =>
                            user.role === "admin" && !isEditingStatus &&
                            setStatusEdit({ id: s.id, status: s.status, comment: "", saving: false })
                          }
                          title={user.role === "admin" ? "Click to update status" : undefined}
                        >
                          {s.status}
                        </span>
                        {user.role === "admin" && (
                          <button
                            onClick={() => setDeleteConfirm(s.id)}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {displayName} &middot; {new Date(s.created_at + "Z").toLocaleDateString()}
                    </p>

                    {isExpanded && (
                      <div className="mt-3">
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">{s.description}</p>
                        <div className="mt-4 pt-4 border-t border-gray-100">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Status History</p>
                          {historyLoading === s.id ? (
                            <p className="text-xs text-gray-400">Loading...</p>
                          ) : entries.length === 0 ? (
                            <p className="text-xs text-gray-400">No history available.</p>
                          ) : (
                            <ol className="relative border-l border-gray-200 ml-1.5 space-y-4">
                              {entries.map((entry, i) => (
                                <li key={entry.id} className="ml-4">
                                  <span className={`absolute -left-1.5 mt-1 w-3 h-3 rounded-full border-2 border-white ${STATUS_TIMELINE_DOT[entry.status]}`} />
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[entry.status]}`}>{entry.status}</span>
                                    {i === 0 && <span className="text-xs text-gray-400 italic">initial</span>}
                                    <span className="text-xs text-gray-400">
                                      {new Date(entry.created_at + "Z").toLocaleString()} &middot; {entry.changed_by}
                                    </span>
                                  </div>
                                  {entry.comment && <p className="text-sm text-gray-600 mt-1">{entry.comment}</p>}
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Admin status edit */}
                {isEditingStatus && statusEdit && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Update Status</p>
                    <div className="flex flex-col gap-2">
                      <select
                        value={statusEdit.status}
                        onChange={(e) => setStatusEdit((prev) => prev && { ...prev, status: e.target.value as SuggestionStatus })}
                        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 w-44"
                      >
                        {ALL_STATUSES.map((st) => <option key={st} value={st}>{st}</option>)}
                      </select>
                      <textarea
                        value={statusEdit.comment}
                        onChange={(e) => setStatusEdit((prev) => prev && { ...prev, comment: e.target.value })}
                        placeholder="Optional comment (e.g. what changed, next steps…)"
                        rows={2}
                        className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400 resize-none"
                      />
                      <div className="flex gap-2">
                        <button onClick={handleStatusSave} disabled={statusEdit.saving} className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                          {statusEdit.saving ? "Saving…" : "Save"}
                        </button>
                        <button onClick={() => setStatusEdit(null)} className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Delete confirm */}
                {deleteConfirm === s.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3">
                    <p className="text-sm text-gray-600 flex-1">Delete this suggestion?</p>
                    <button onClick={() => handleDelete(s.id)} className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
                    <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
