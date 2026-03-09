export interface ParsedCitation {
  num: string;
  name: string;
  description: string;
}

export function parseContentAndCitations(raw: string): {
  main: string;
  citations: ParsedCitation[];
} {
  const match =
    /\n\n---\n\n## Citations\n|\n---\n\n## Citations\n|\n\n## Citations\n/.exec(raw);
  if (!match) return { main: raw, citations: [] };

  const main = raw.slice(0, match.index);
  const citationsRaw = raw.slice(match.index + match[0].length);
  const citations = citationsRaw
    .split("\n")
    .map(l => l.trim())
    .filter(l => /^\[\d+\]/.test(l))
    .map(parseCitation);

  return { main, citations };
}

export function parseCitation(line: string): ParsedCitation {
  const numMatch = line.match(/^\[(\d+)\]/);
  const num = numMatch?.[1] ?? "";
  const rest = line.replace(/^\[\d+\]\s*/, "");

  const boldDash = rest.match(/^\*\*(.+?)\*\*\s*[—–-]\s*([\s\S]*)/);
  if (boldDash) return { num, name: boldDash[1], description: boldDash[2] };

  const plainDash = rest.match(/^(.+?)\s*[—–-]\s*([\s\S]*)/);
  if (plainDash) return { num, name: plainDash[1], description: plainDash[2] };

  return { num, name: "", description: rest };
}

export function citationsToMarkdown(citations: ParsedCitation[]): string {
  return [
    "## Citations",
    "",
    ...citations.map(c => `**[${c.num}]${c.name ? ` ${c.name}` : ""}**\n\n${c.description}`),
  ].join("\n\n");
}
