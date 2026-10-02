// Document edit operations shared by the Word add-in chat route (which receives
// them from Claude as tool calls) and the task pane (which applies them via Office.js).

export type DocEdit =
  | { type: "replace_text"; find: string; replace: string; match_case: boolean; whole_word: boolean; paragraphs: number[] | null; reason: string }
  | { type: "rewrite_paragraph"; paragraph: number; new_text: string; reason: string }
  | { type: "insert_paragraphs"; after_paragraph: number; paragraphs: string[]; reason: string }
  | { type: "delete_paragraph"; paragraph: number; reason: string }
  | { type: "add_comment"; paragraph: number; anchor_text: string | null; comment: string };

export interface DocSelection {
  text: string;
  // Inclusive paragraph index range the selection spans, or null if it couldn't be mapped
  paragraphStart: number | null;
  paragraphEnd: number | null;
}

export interface DocSnapshot {
  paragraphs: string[];
  selection: DocSelection | null;
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isIdx = (v: unknown, max: number, min = 0): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v < max;

/**
 * Validate a tool call from Claude into a DocEdit. Returns null when the input is
 * malformed or references a paragraph outside the document.
 */
export function parseEdit(name: string, input: unknown, paragraphCount: number): DocEdit | null {
  if (!input || typeof input !== "object") return null;
  const i = input as Record<string, unknown>;
  const reason = isStr(i.reason) ? i.reason : "";

  switch (name) {
    case "replace_text": {
      if (!isStr(i.find) || !i.find || !isStr(i.replace) || i.find === i.replace) return null;
      let paragraphs: number[] | null = null;
      if (Array.isArray(i.paragraphs) && i.paragraphs.length > 0) {
        if (!i.paragraphs.every(p => isIdx(p, paragraphCount))) return null;
        paragraphs = i.paragraphs as number[];
      }
      return {
        type: "replace_text", find: i.find, replace: i.replace,
        match_case: i.match_case !== false, whole_word: i.whole_word === true,
        paragraphs, reason,
      };
    }
    case "rewrite_paragraph":
      if (!isIdx(i.paragraph, paragraphCount) || !isStr(i.new_text)) return null;
      return { type: "rewrite_paragraph", paragraph: i.paragraph, new_text: i.new_text, reason };
    case "insert_paragraphs":
      if (!isIdx(i.after_paragraph, paragraphCount, -1)) return null;
      if (!Array.isArray(i.paragraphs) || i.paragraphs.length === 0 || !i.paragraphs.every(isStr)) return null;
      return { type: "insert_paragraphs", after_paragraph: i.after_paragraph, paragraphs: i.paragraphs as string[], reason };
    case "delete_paragraph":
      if (!isIdx(i.paragraph, paragraphCount)) return null;
      return { type: "delete_paragraph", paragraph: i.paragraph, reason };
    case "add_comment":
      if (!isIdx(i.paragraph, paragraphCount) || !isStr(i.comment) || !i.comment.trim()) return null;
      return { type: "add_comment", paragraph: i.paragraph, anchor_text: isStr(i.anchor_text) && i.anchor_text ? i.anchor_text : null, comment: i.comment };
    default:
      return null;
  }
}

/** One-line description of an edit, used in chat history so Claude knows what it already changed. */
export function describeEdit(e: DocEdit): string {
  const clip = (s: string, n = 80) => (s.length > n ? s.slice(0, n) + "…" : s);
  switch (e.type) {
    case "replace_text": return `replaced "${clip(e.find)}" with "${clip(e.replace)}"`;
    case "rewrite_paragraph": return `rewrote paragraph ${e.paragraph}`;
    case "insert_paragraphs": return `inserted ${e.paragraphs.length} paragraph(s) after paragraph ${e.after_paragraph}`;
    case "delete_paragraph": return `deleted paragraph ${e.paragraph}`;
    case "add_comment": return `commented on paragraph ${e.paragraph}: "${clip(e.comment)}"`;
  }
}
