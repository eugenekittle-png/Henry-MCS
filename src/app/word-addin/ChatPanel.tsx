"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { diffWordsWithSpace } from "diff";
import { describeEdit, type DocEdit } from "@/lib/word-edits";
import { applyEdit, goToText, insertAfterSelection, readSelectionText, readSnapshot } from "./word";

/* eslint-disable @typescript-eslint/no-explicit-any */

type EditStatus = "pending" | "applying" | "applied" | "skipped" | "failed";
interface EditItem { id: number; edit: DocEdit; status: EditStatus; error?: string; count?: number; locator?: string | null }
interface Turn {
  id: number;
  role: "user" | "assistant";
  text: string;
  edits: EditItem[];
  // assistant turns
  streaming?: boolean;
  phase?: "reading" | "thinking" | "editing" | null;
  errors?: string[];
  // user turns
  contextLabel?: string;
}

interface Props {
  officeReady: boolean;
  authHeaders: () => HeadersInit;
  matterRequired: boolean;
  clientLabel: string;
  matterLabel: string;
  clientNumber: string | null;
  matterNumber: string | null;
}

const STARTERS: { label: string; prompt: string; fill?: boolean }[] = [
  { label: "Summarize this document", prompt: "Summarize this document - the parties, key terms, obligations, and important dates." },
  { label: "Key dates & deadlines", prompt: "List every date, deadline, and notice period in this document." },
  { label: "Flag risks with comments", prompt: "Review this document for ambiguous, one-sided, or risky provisions and add a Word comment on each one explaining the issue." },
  { label: "Change every mention of…", prompt: "Change every mention of \"\" to \"\"", fill: true },
  { label: "Tighten the selected text", prompt: "Rewrite the selected text to be clearer and more concise without changing its legal meaning." },
  { label: "Add a new clause…", prompt: "Add a clause after the section on  that ", fill: true },
];

const PREFS_KEY = "addin_chat_prefs";

function loadPrefs(): { trackChanges: boolean; reviewFirst: boolean } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return { trackChanges: p.trackChanges !== false, reviewFirst: p.reviewFirst === true };
  } catch { return { trackChanges: true, reviewFirst: false }; }
}

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export default function ChatPanel(props: Props) {
  const { officeReady, authHeaders, matterRequired } = props;
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectionWords, setSelectionWords] = useState(0);
  const [prefs, setPrefs] = useState({ trackChanges: true, reviewFirst: false });

  const nextId = useRef(1);
  const prefsRef = useRef(prefs);
  const snapshots = useRef(new Map<number, string[]>());
  const applyChain = useRef<Promise<void>>(Promise.resolve());
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const p = loadPrefs(); setPrefs(p); prefsRef.current = p; }, []);
  function updatePrefs(patch: Partial<typeof prefs>) {
    const p = { ...prefsRef.current, ...patch };
    prefsRef.current = p;
    setPrefs(p);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns]);

  // Keep the "Selection: N words" context chip in sync with Word
  useEffect(() => {
    if (!officeReady) return;
    const Office = (window as any).Office;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { readSelectionText().then(t => setSelectionWords(wordCount(t))).catch(() => {}); }, 250);
    };
    refresh();
    try { Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, refresh); } catch { /* unsupported */ }
    return () => {
      clearTimeout(timer);
      try { Office.context.document.removeHandlerAsync(Office.EventType.DocumentSelectionChanged, { handler: refresh }); } catch { /* ignore */ }
    };
  }, [officeReady]);

  // Auto-grow the composer
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [input]);

  const patchTurn = useCallback((turnId: number, fn: (t: Turn) => Turn) => {
    setTurns(prev => prev.map(t => (t.id === turnId ? fn(t) : t)));
  }, []);

  const patchEdit = useCallback((turnId: number, editId: number, patch: Partial<EditItem>) => {
    patchTurn(turnId, t => ({ ...t, edits: t.edits.map(e => (e.id === editId ? { ...e, ...patch } : e)) }));
  }, [patchTurn]);

  // Edits are applied one at a time, in order, so they never race inside Word
  const queueApply = useCallback((turnId: number, item: EditItem) => {
    patchEdit(turnId, item.id, { status: "applying", error: undefined });
    applyChain.current = applyChain.current.then(async () => {
      const snapshot = snapshots.current.get(turnId) ?? [];
      try {
        const res = await applyEdit(snapshot, item.edit, prefsRef.current.trackChanges);
        patchEdit(turnId, item.id, { status: "applied", count: res.count, locator: res.locator });
      } catch (err) {
        patchEdit(turnId, item.id, { status: "failed", error: err instanceof Error ? err.message : String(err) });
      }
    });
  }, [patchEdit]);

  function buildHistory(prior: Turn[]) {
    return prior.map(t => {
      if (t.role === "user") return { role: "user" as const, content: t.text };
      const editNote = t.edits.length
        ? `[Document edits from this turn: ${t.edits.map(e => `${describeEdit(e.edit)} (${e.status})`).join("; ")}]`
        : "";
      return { role: "assistant" as const, content: [t.text.trim(), editNote].filter(Boolean).join("\n\n") || "(no response)" };
    });
  }

  async function send(promptOverride?: string) {
    const text = (promptOverride ?? input).trim();
    if (!text || busy || !officeReady || matterRequired) return;

    setBusy(true);
    setInput("");
    const prior = turns;
    const userTurn: Turn = { id: nextId.current++, role: "user", text, edits: [] };
    const asstId = nextId.current++;
    setTurns(prev => [...prev, userTurn, { id: asstId, role: "assistant", text: "", edits: [], streaming: true, phase: "reading" }]);

    const fail = (msg: string) => patchTurn(asstId, t => ({ ...t, streaming: false, phase: null, errors: [...(t.errors ?? []), msg] }));

    let snapshot;
    try {
      snapshot = await readSnapshot();
    } catch {
      fail("Couldn't read the document. Make sure a Word document is open.");
      setBusy(false);
      return;
    }
    snapshots.current.set(asstId, snapshot.paragraphs);
    const selWords = snapshot.selection ? wordCount(snapshot.selection.text) : 0;
    setTurns(prev => prev.map(t => (t.id === userTurn.id ? { ...t, contextLabel: selWords ? `Selection · ${selWords} word${selWords === 1 ? "" : "s"}` : "Whole document" } : t)));
    patchTurn(asstId, t => ({ ...t, phase: "thinking" }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/addin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authHeaders() as Record<string, string>) },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [...buildHistory(prior), { role: "user", content: text }],
          document: snapshot,
          client: props.clientLabel,
          matter: props.matterLabel,
          clientNumber: props.clientNumber,
          matterNumber: props.matterNumber,
        }),
      });
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try { const d = await res.json(); if (d.error) msg = d.error; } catch { /* non-JSON */ }
        throw new Error(msg);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break outer;
          let evt: any;
          try { evt = JSON.parse(data); } catch { continue; }
          if (evt.type === "text") {
            patchTurn(asstId, t => ({ ...t, text: t.text + evt.text }));
          } else if (evt.type === "status") {
            patchTurn(asstId, t => ({ ...t, phase: evt.status }));
          } else if (evt.type === "edit") {
            const item: EditItem = { id: nextId.current++, edit: evt.edit, status: "pending" };
            patchTurn(asstId, t => ({ ...t, edits: [...t.edits, item] }));
            if (!prefsRef.current.reviewFirst) queueApply(asstId, item);
          } else if (evt.type === "error") {
            patchTurn(asstId, t => ({ ...t, errors: [...(t.errors ?? []), evt.error] }));
          }
        }
      }
    } catch (err) {
      if ((err as any)?.name !== "AbortError") fail(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      abortRef.current = null;
      patchTurn(asstId, t => ({ ...t, streaming: false, phase: null }));
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function pickStarter(s: (typeof STARTERS)[number]) {
    if (!s.fill) { send(s.prompt); return; }
    setInput(s.prompt);
    // Put the cursor in the first blank (between the first pair of quotes, or the double space)
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      const q = s.prompt.indexOf('""');
      const pos = q >= 0 ? q + 1 : s.prompt.indexOf("  ") + 1 || s.prompt.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const disabledReason = matterRequired ? "Choose a client and matter above to start." : !officeReady ? "Connecting to Word…" : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Conversation */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {turns.length === 0 ? (
          <div className="pt-4">
            <p className="text-sm font-semibold text-gray-800">What would you like to do with this document?</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Ask a question, or tell me what to change. Edits go straight into the document{prefs.trackChanges ? " as tracked changes" : ""}.
              Select text first to focus on a specific clause.
            </p>
            <div className="mt-4 flex flex-col gap-1.5">
              {STARTERS.map(s => (
                <button
                  key={s.label}
                  onClick={() => pickStarter(s)}
                  disabled={!!disabledReason || busy}
                  className="text-left text-xs text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map(t => t.role === "user" ? (
            <div key={t.id} className="flex flex-col items-end">
              <div className="max-w-[90%] bg-blue-600 text-white rounded-2xl rounded-br-md px-3 py-2 text-xs whitespace-pre-wrap break-words">{t.text}</div>
              {t.contextLabel && <span className="text-[10px] text-gray-400 mt-0.5 mr-1">{t.contextLabel}</span>}
            </div>
          ) : (
            <AssistantTurn
              key={t.id}
              turn={t}
              snapshot={snapshots.current.get(t.id) ?? []}
              officeReady={officeReady}
              onApply={item => queueApply(t.id, item)}
              onSkip={item => patchEdit(t.id, item.id, { status: "skipped" })}
            />
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white px-3 pt-2 pb-2.5">
        <div className="flex items-center gap-1.5 mb-1.5 text-[11px]">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${selectionWords ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-gray-100 text-gray-500"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${selectionWords ? "bg-amber-500" : "bg-gray-400"}`} />
            {selectionWords ? `Selection · ${selectionWords} word${selectionWords === 1 ? "" : "s"}` : "Whole document"}
          </span>
        </div>
        <div className={`flex items-end gap-2 border rounded-xl bg-white px-2.5 py-1.5 ${disabledReason ? "border-gray-200" : "border-gray-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500"}`}>
          <textarea
            ref={inputRef}
            rows={1}
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!!disabledReason}
            placeholder={disabledReason ?? (turns.length ? "Ask a follow-up or request a change…" : "e.g. Change every mention of the Seller to the Vendor")}
            title="Tip: Press Win + H to dictate using Windows Voice Typing"
            className="flex-1 resize-none text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none bg-transparent py-1 max-h-[180px] disabled:cursor-not-allowed"
          />
          {busy ? (
            <button onClick={() => abortRef.current?.abort()} className="flex-shrink-0 w-7 h-7 rounded-lg bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700" title="Stop">
              <span className="w-2.5 h-2.5 bg-white rounded-sm" />
            </button>
          ) : (
            <button
              onClick={() => send()}
              disabled={!input.trim() || !!disabledReason}
              className="flex-shrink-0 w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-30"
              title="Send (Enter)"
            >
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor"><path d="M8 2.5 13 7.5l-1.06 1.06L8.75 5.37V13.5h-1.5V5.37L4.06 8.56 3 7.5z" /></svg>
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500">
          <label className="inline-flex items-center gap-1 cursor-pointer select-none">
            <input type="checkbox" checked={prefs.trackChanges} onChange={e => updatePrefs({ trackChanges: e.target.checked })} className="w-3 h-3 accent-blue-600" />
            Track changes
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer select-none" title="Show proposed edits for approval instead of applying them right away">
            <input type="checkbox" checked={prefs.reviewFirst} onChange={e => updatePrefs({ reviewFirst: e.target.checked })} className="w-3 h-3 accent-blue-600" />
            Review edits first
          </label>
        </div>
      </div>
    </div>
  );
}

/* ── Assistant message ─────────────────────────────────────────────── */

const MD = "text-xs text-gray-800 leading-relaxed break-words [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-[13px] [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:mt-3 [&_h2]:mt-3 [&_h3]:mt-2 [&_strong]:font-semibold [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_table]:w-full [&_table]:my-2 [&_th]:text-left [&_th]:border-b [&_th]:border-gray-200 [&_th]:py-1 [&_td]:py-1 [&_td]:align-top [&_td]:border-b [&_td]:border-gray-100 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-2 [&_blockquote]:text-gray-600";

function AssistantTurn({ turn, snapshot, officeReady, onApply, onSkip }: {
  turn: Turn; snapshot: string[]; officeReady: boolean;
  onApply: (e: EditItem) => void; onSkip: (e: EditItem) => void;
}) {
  const [inserted, setInserted] = useState(false);
  const pending = turn.edits.filter(e => e.status === "pending");
  const applied = turn.edits.filter(e => e.status === "applied");
  const showPhase = turn.streaming && !turn.text && turn.edits.length === 0;
  const phaseLabel = turn.phase === "reading" ? "Reading the document…" : turn.phase === "editing" ? "Preparing edits…" : "Thinking…";

  return (
    <div className="space-y-2">
      {showPhase && (
        <div className="flex items-center gap-2 text-gray-400 text-xs py-1">
          <span className="flex gap-0.5">
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
          </span>
          {phaseLabel}
        </div>
      )}

      {turn.text && (
        <div className={MD}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.text}</ReactMarkdown>
          {turn.streaming && turn.edits.length === 0 && <span className="inline-block w-1.5 h-3 bg-gray-400 animate-pulse ml-0.5 align-middle" />}
        </div>
      )}

      {turn.edits.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              {pending.length > 0 ? `${pending.length} proposed edit${pending.length === 1 ? "" : "s"}` : `${applied.length} edit${applied.length === 1 ? "" : "s"} made`}
              {turn.streaming && <span className="normal-case font-normal text-gray-400"> · more coming…</span>}
            </p>
            {pending.length > 1 && (
              <button onClick={() => pending.forEach(onApply)} disabled={!officeReady} className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50">
                Apply all
              </button>
            )}
          </div>
          {turn.edits.map(item => (
            <EditCard key={item.id} item={item} snapshot={snapshot} officeReady={officeReady} onApply={() => onApply(item)} onSkip={() => onSkip(item)} />
          ))}
        </div>
      )}

      {turn.errors?.map((err, i) => (
        <div key={i} className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">{err}</div>
      ))}

      {!turn.streaming && turn.text && turn.edits.length === 0 && (
        <div className="flex gap-3 pt-0.5">
          <button
            onClick={async () => { try { await insertAfterSelection(turn.text.replace(/[*#`]/g, "")); setInserted(true); } catch { /* ignore */ } }}
            disabled={!officeReady || inserted}
            className="text-[11px] text-gray-500 hover:text-blue-600 disabled:opacity-60"
          >
            {inserted ? "✓ Inserted" : "Insert into document"}
          </button>
          <button
            onClick={() => { navigator.clipboard?.writeText(turn.text).catch(() => {}); }}
            className="text-[11px] text-gray-500 hover:text-blue-600"
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Edit card ─────────────────────────────────────────────────────── */

function InlineDiff({ before, after }: { before: string; after: string }) {
  return (
    <span className="whitespace-pre-wrap">
      {diffWordsWithSpace(before, after).map((p, i) =>
        p.added ? <ins key={i} className="bg-emerald-100 text-emerald-900 no-underline rounded-sm">{p.value}</ins>
        : p.removed ? <del key={i} className="bg-red-50 text-red-700 rounded-sm">{p.value}</del>
        : <span key={i}>{p.value}</span>
      )}
    </span>
  );
}

function EditCard({ item, snapshot, officeReady, onApply, onSkip }: {
  item: EditItem; snapshot: string[]; officeReady: boolean; onApply: () => void; onSkip: () => void;
}) {
  const e = item.edit;
  const [expanded, setExpanded] = useState(false);

  let title: string;
  let body: React.ReactNode;
  // Where to jump: the new text once applied, the original text while pending
  let originalLocator: string | null = null;

  switch (e.type) {
    case "replace_text":
      title = e.reason || "Replace text";
      body = <><del className="bg-red-50 text-red-700 rounded-sm">{e.find}</del>{" → "}<ins className="bg-emerald-100 text-emerald-900 no-underline rounded-sm">{e.replace || "(removed)"}</ins></>;
      originalLocator = e.find;
      break;
    case "rewrite_paragraph":
      title = e.reason || "Rewrite paragraph";
      body = <InlineDiff before={snapshot[e.paragraph] ?? ""} after={e.new_text} />;
      originalLocator = snapshot[e.paragraph] ?? null;
      break;
    case "insert_paragraphs":
      title = e.reason || "Insert text";
      body = <ins className="bg-emerald-100 text-emerald-900 no-underline whitespace-pre-wrap">{e.paragraphs.join("\n\n")}</ins>;
      originalLocator = snapshot[e.after_paragraph] ?? null;
      break;
    case "delete_paragraph":
      title = e.reason || "Delete paragraph";
      body = <del className="bg-red-50 text-red-700">{snapshot[e.paragraph]}</del>;
      originalLocator = snapshot[e.paragraph] ?? null;
      break;
    case "add_comment":
      title = "Comment";
      body = <span className="text-gray-700">{e.anchor_text && <span className="text-gray-400">on “{e.anchor_text}”: </span>}{e.comment}</span>;
      originalLocator = e.anchor_text ?? snapshot[e.paragraph] ?? null;
      break;
  }

  const locator = item.status === "applied" ? (item.locator ?? originalLocator) : originalLocator;
  const statusEl = {
    pending: null,
    applying: <span className="text-gray-400">Applying…</span>,
    applied: <span className="text-emerald-600">✓ {e.type === "replace_text" && item.count && item.count > 1 ? `${item.count} places` : "Done"}</span>,
    skipped: <span className="text-gray-400">Skipped</span>,
    failed: <span className="text-red-600">Not applied</span>,
  }[item.status];

  return (
    <div className={`bg-white border rounded-lg px-2.5 py-2 ${item.status === "failed" ? "border-red-200" : item.status === "skipped" ? "border-gray-100 opacity-60" : "border-gray-200"}`}>
      <div className="flex items-start gap-2">
        <button
          onClick={() => { if (locator) goToText(locator).catch(() => {}); }}
          disabled={!locator || !officeReady}
          className="flex-1 min-w-0 text-left text-[11px] font-medium text-gray-800 hover:text-blue-700 disabled:hover:text-gray-800"
          title={locator ? "Show in document" : undefined}
        >
          {title}
        </button>
        <span className="text-[11px] flex-shrink-0">{statusEl}</span>
      </div>
      <div
        onClick={() => setExpanded(x => !x)}
        className={`mt-1 text-[11px] leading-relaxed text-gray-600 cursor-pointer ${expanded ? "" : "line-clamp-4"}`}
        title={expanded ? "Collapse" : "Expand"}
      >
        {body}
      </div>
      {item.status === "failed" && item.error && <p className="mt-1 text-[11px] text-red-600">{item.error}</p>}
      {(item.status === "pending" || item.status === "failed") && (
        <div className="mt-1.5 flex gap-1.5">
          <button onClick={onApply} disabled={!officeReady} className="text-[11px] bg-blue-600 text-white px-2.5 py-0.5 rounded font-medium hover:bg-blue-700 disabled:opacity-50">
            {item.status === "failed" ? "Retry" : "Apply"}
          </button>
          {item.status === "pending" && (
            <button onClick={onSkip} className="text-[11px] border border-gray-200 text-gray-500 px-2.5 py-0.5 rounded hover:bg-gray-50">Skip</button>
          )}
        </div>
      )}
    </div>
  );
}
