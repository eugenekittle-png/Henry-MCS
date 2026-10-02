// Office.js helpers for the Word add-in task pane: reading a document snapshot
// and applying DocEdits from Claude as small, targeted (tracked) changes.

import { diffWordsWithSpace } from "diff";
import type { DocEdit, DocSnapshot } from "@/lib/word-edits";

/* eslint-disable @typescript-eslint/no-explicit-any */

const W = () => (window as any).Word;

// Word's search() rejects strings over 255 chars and treats ^ as a special code
const MAX_SEARCH = 255;
const UNSEARCHABLE = /[\u0000-\u001f]/;
const escapeSearch = (s: string) => s.replace(/\^/g, "^^");
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

export interface ApplyResult {
  // Number of places changed (replace_text can hit many)
  count: number;
  // Text to search for when the user clicks the change to jump to it
  locator: string | null;
}

export async function readSnapshot(): Promise<DocSnapshot> {
  return W().run(async (context: any) => {
    const paras = context.document.body.paragraphs;
    paras.load("items/text");
    const sel = context.document.getSelection();
    sel.load("text");
    const selParas = sel.paragraphs;
    selParas.load("items/text");
    await context.sync();

    const paragraphs: string[] = paras.items.map((p: any) => p.text as string);
    const selText = (sel.text as string) ?? "";
    if (!selText.trim()) return { paragraphs, selection: null };

    // Map the selection to paragraph indexes by matching its paragraphs' text in order
    const selTexts: string[] = selParas.items.map((p: any) => p.text as string);
    let start: number | null = null;
    for (let i = 0; i + selTexts.length <= paragraphs.length; i++) {
      if (selTexts.every((t, k) => paragraphs[i + k] === t)) { start = i; break; }
    }
    return {
      paragraphs,
      selection: {
        text: selText,
        paragraphStart: start,
        paragraphEnd: start === null ? null : start + selTexts.length - 1,
      },
    };
  });
}

export async function readSelectionText(): Promise<string> {
  return W().run(async (context: any) => {
    const sel = context.document.getSelection();
    sel.load("text");
    await context.sync();
    return (sel.text as string) ?? "";
  });
}

/**
 * Find the live paragraph that was at `index` when the snapshot was taken. Earlier
 * edits in the same turn may have shifted indexes, so look nearby for matching text.
 */
function resolveParagraph(items: any[], index: number, expected: string): any | null {
  const want = norm(expected);
  for (let d = 0; d <= 30; d++) {
    for (const j of d === 0 ? [index] : [index - d, index + d]) {
      if (j >= 0 && j < items.length && norm(items[j].text) === want) return items[j];
    }
  }
  return null;
}

function countOccurrences(haystack: string, needle: string, before = Infinity): number {
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1 && i < before; i = haystack.indexOf(needle, i + needle.length)) n++;
  return n;
}

// Swap straight quotes for curly ones and vice versa, so Claude's quoting doesn't break matching
function quoteVariants(s: string): string[] {
  const curly = s
    .replace(/(^|[\s(\[])"/g, "$1“").replace(/"/g, "”")
    .replace(/(^|[\s(\[])'/g, "$1‘").replace(/'/g, "’");
  const straight = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  return [...new Set([s, curly, straight])];
}

interface Hunk { oldStart: number; oldText: string; newText: string }

function diffHunks(oldText: string, newText: string): Hunk[] {
  const hunks: Hunk[] = [];
  let pos = 0;
  let cur: Hunk | null = null;
  for (const part of diffWordsWithSpace(oldText, newText)) {
    if (!part.added && !part.removed) {
      if (cur) { hunks.push(cur); cur = null; }
      pos += part.value.length;
    } else {
      if (!cur) cur = { oldStart: pos, oldText: "", newText: "" };
      if (part.removed) { cur.oldText += part.value; pos += part.value.length; }
      else cur.newText += part.value;
    }
  }
  if (cur) hunks.push(cur);
  return hunks;
}

/**
 * Rewrite a paragraph by changing only the words that differ, so the tracked change
 * reads like a lawyer's markup rather than a whole-paragraph delete/insert. Falls back
 * to replacing the whole paragraph when the diff can't be located reliably.
 */
async function rewriteParagraphMinimal(context: any, para: any, oldText: string, newText: string) {
  if (oldText === newText) return;
  const hunks = diffHunks(oldText, newText);
  const changed = hunks.reduce((n, h) => n + h.oldText.length, 0);
  const wholesale = hunks.length > 15 || changed > oldText.length * 0.6;

  type Planned = { hunk: Hunk; needle: string; k: number; total: number; mode: "replace" | "after" | "start"; results?: any };
  const plan: Planned[] = [];
  let ok = !wholesale;
  for (const h of ok ? hunks : []) {
    if (h.oldText) {
      if (h.oldText.length > MAX_SEARCH || UNSEARCHABLE.test(h.oldText)) { ok = false; break; }
      plan.push({ hunk: h, needle: h.oldText, k: countOccurrences(oldText, h.oldText, h.oldStart), total: countOccurrences(oldText, h.oldText), mode: "replace" });
    } else if (h.oldStart === 0) {
      plan.push({ hunk: h, needle: "", k: 0, total: 0, mode: "start" });
    } else {
      // Pure insertion: anchor on the text immediately before it
      const anchor = oldText.slice(Math.max(0, h.oldStart - 40), h.oldStart);
      if (!anchor.trim() || UNSEARCHABLE.test(anchor)) { ok = false; break; }
      const anchorStart = h.oldStart - anchor.length;
      plan.push({ hunk: h, needle: anchor, k: countOccurrences(oldText, anchor, anchorStart + 1) - 1, total: countOccurrences(oldText, anchor), mode: "after" });
    }
  }

  if (ok) {
    for (const p of plan) {
      if (p.mode === "start") continue;
      p.results = para.search(escapeSearch(p.needle), { matchCase: true });
      p.results.load("items");
    }
    await context.sync();
    // Every needle must be found exactly as often as in our copy of the text, or offsets can't be trusted
    ok = plan.every(p => p.mode === "start" || (p.results.items.length === p.total && p.k >= 0 && p.k < p.total));
  }

  if (!ok) {
    para.insertText(newText, "Replace");
    await context.sync();
    return;
  }

  for (const p of plan) {
    if (p.mode === "start") para.insertText(p.hunk.newText, "Start");
    else {
      const range = p.results.items[p.k];
      if (p.mode === "after") range.insertText(p.hunk.newText, "After");
      else if (p.hunk.newText) range.insertText(p.hunk.newText, "Replace");
      else range.delete();
    }
  }
  await context.sync();
}

async function applyReplaceText(context: any, items: any[], snapshot: string[], e: Extract<DocEdit, { type: "replace_text" }>): Promise<ApplyResult> {
  // Long phrases can't go through Word search; fall back to per-paragraph rewrites
  if (e.find.length > MAX_SEARCH || UNSEARCHABLE.test(e.find)) {
    let count = 0;
    const targets = e.paragraphs ?? snapshot.map((_, i) => i);
    for (const i of targets) {
      const text = snapshot[i];
      if (!text?.includes(e.find)) continue;
      const para = resolveParagraph(items, i, text);
      if (!para) continue;
      await rewriteParagraphMinimal(context, para, text, text.split(e.find).join(e.replace));
      count += countOccurrences(text, e.find);
    }
    return { count, locator: e.replace || null };
  }

  const scopes: any[] = e.paragraphs
    ? e.paragraphs.map(i => resolveParagraph(items, i, snapshot[i])).filter(Boolean)
    : [context.document.body];

  for (const variant of quoteVariants(e.find)) {
    const searches = scopes.map(s => {
      const r = s.search(escapeSearch(variant), { matchCase: e.match_case, matchWholeWord: e.whole_word });
      r.load("items");
      return r;
    });
    await context.sync();
    const ranges = searches.flatMap(r => r.items);
    if (ranges.length === 0) continue;
    for (const r of ranges) {
      if (e.replace) r.insertText(e.replace, "Replace");
      else r.delete();
    }
    await context.sync();
    return { count: ranges.length, locator: e.replace || null };
  }
  return { count: 0, locator: null };
}

async function applyEditInContext(context: any, snapshot: string[], e: DocEdit): Promise<ApplyResult> {
  const paras = context.document.body.paragraphs;
  paras.load("items/text,items/style");
  await context.sync();
  const items: any[] = paras.items;

  const target = (i: number) => {
    const p = resolveParagraph(items, i, snapshot[i] ?? "");
    if (!p) throw new Error("That paragraph has changed since the request was sent.");
    return p;
  };

  switch (e.type) {
    case "replace_text": {
      const res = await applyReplaceText(context, items, snapshot, e);
      if (res.count === 0) throw new Error(`Couldn't find "${e.find.slice(0, 60)}" in the document.`);
      return res;
    }
    case "rewrite_paragraph": {
      const para = target(e.paragraph);
      await rewriteParagraphMinimal(context, para, para.text, e.new_text);
      return { count: 1, locator: e.new_text };
    }
    case "insert_paragraphs": {
      let cur: any;
      let resetStyle = false;
      if (e.after_paragraph < 0) {
        // Insert in order at the very start of the body
        cur = context.document.body.insertParagraph(e.paragraphs[0], "Start");
      } else {
        const anchor = target(e.after_paragraph);
        // New body text shouldn't inherit a heading/title style from its anchor
        resetStyle = /heading|title/i.test(anchor.style ?? "");
        cur = anchor.insertParagraph(e.paragraphs[0], "After");
      }
      if (resetStyle) cur.styleBuiltIn = "Normal";
      for (const text of e.paragraphs.slice(1)) {
        cur = cur.insertParagraph(text, "After");
        if (resetStyle) cur.styleBuiltIn = "Normal";
      }
      await context.sync();
      return { count: e.paragraphs.length, locator: e.paragraphs[0] };
    }
    case "delete_paragraph": {
      target(e.paragraph).delete();
      await context.sync();
      return { count: 1, locator: null };
    }
    case "add_comment": {
      const para = target(e.paragraph);
      let range = para.getRange();
      if (e.anchor_text && e.anchor_text.length <= MAX_SEARCH && !UNSEARCHABLE.test(e.anchor_text)) {
        const found = para.search(escapeSearch(e.anchor_text), { matchCase: false });
        found.load("items");
        await context.sync();
        if (found.items.length > 0) range = found.items[0];
      }
      range.insertComment(e.comment);
      await context.sync();
      return { count: 1, locator: e.anchor_text ?? snapshot[e.paragraph] };
    }
  }
}

/**
 * Apply one edit. `snapshot` is the paragraph text Claude saw; it's used to find the
 * right paragraph even if earlier edits shifted things around.
 */
export async function applyEdit(snapshot: string[], edit: DocEdit, trackChanges: boolean): Promise<ApplyResult> {
  return W().run(async (context: any) => {
    const doc = context.document;
    let original: string | null = null;
    try {
      doc.load("changeTrackingMode");
      await context.sync();
      original = doc.changeTrackingMode;
      const desired = trackChanges ? "TrackAll" : "Off";
      if (original !== desired) { doc.changeTrackingMode = desired; await context.sync(); }
    } catch { original = null; /* change tracking API unsupported on this host */ }

    try {
      return await applyEditInContext(context, snapshot, edit);
    } finally {
      if (original !== null) {
        try { doc.changeTrackingMode = original; await context.sync(); } catch { /* ignore */ }
      }
    }
  });
}

/** Select the first place `text` appears so the user can see a change. */
export async function goToText(text: string): Promise<boolean> {
  const needle = text.split(/[\u0000-\u001f]/)[0].slice(0, 120).trim();
  if (!needle) return false;
  return W().run(async (context: any) => {
    for (const variant of quoteVariants(needle)) {
      const results = context.document.body.search(escapeSearch(variant), { matchCase: false });
      results.load("items");
      await context.sync();
      if (results.items.length > 0) {
        results.items[0].select();
        await context.sync();
        return true;
      }
    }
    return false;
  });
}

/** Insert text as new paragraphs after the current selection (used for "Insert into document" on answers). */
export async function insertAfterSelection(text: string): Promise<void> {
  await W().run(async (context: any) => {
    const sel = context.document.getSelection();
    const lines = text.split(/\n{2,}/).map(l => l.trim()).filter(Boolean);
    let cur = sel.paragraphs.getLast();
    for (const line of lines) cur = cur.insertParagraph(line, "After");
    await context.sync();
  });
}
