import JSZip from "jszip";

// ── XML helpers ────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the end position of the matching close tag, starting from the character
 * immediately after the first open tag. Handles nesting.
 * Returns the index just past the close tag, or -1 if not found.
 */
function findMatchingClose(
  xml: string,
  openPattern: string,
  closeTag: string,
  fromPos: number
): number {
  let depth = 1;
  let pos = fromPos;

  while (pos < xml.length && depth > 0) {
    const nextOpen = xml.indexOf(openPattern, pos);
    const nextClose = xml.indexOf(closeTag, pos);

    if (nextClose === -1) return -1;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openPattern.length;
    } else {
      depth--;
      pos = nextClose + closeTag.length;
    }
  }

  return depth === 0 ? pos : -1;
}

/**
 * Build the replacement sdtContent preserving paragraph and run properties from the original.
 */
function buildSdtContent(originalContent: string, value: string): string {
  // Preserve paragraph properties
  const pPrMatch = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(originalContent);
  const pPr = pPrMatch ? pPrMatch[0] : "";

  // Preserve run properties from the first <w:r>
  const rPrMatch = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(originalContent);
  const rPr = rPrMatch ? rPrMatch[0] : "";

  // Handle multi-line values — split on \n and join with <w:br>
  const lines = value.split("\n");
  const runParts = lines.map((line, i) => {
    const escaped = escapeXml(line);
    const spaceAttr = /^\s|\s$/.test(line) ? ' xml:space="preserve"' : "";
    const t = `<w:t${spaceAttr}>${escaped}</w:t>`;
    const br = i < lines.length - 1 ? '<w:br w:type="textWrapping"/>' : "";
    return t + br;
  });

  return `<w:sdtContent><w:p>${pPr}<w:r>${rPr}${runParts.join("")}</w:r></w:p></w:sdtContent>`;
}

/**
 * Fill a single content-control tag in the XML, returning the updated XML.
 */
function replaceSdtContent(xml: string, tagName: string, value: string): string {
  // Find the <w:tag> element with this val
  const tagPattern = new RegExp(`<w:tag[^>]+w:val="${escapeRegex(tagName)}"[^>]*/>`);
  const tagMatch = tagPattern.exec(xml);
  if (!tagMatch) return xml;

  const tagPos = tagMatch.index;

  // Walk backwards to find the start of the containing <w:sdt
  const beforeTag = xml.slice(0, tagPos);
  const sdtStart = beforeTag.lastIndexOf("<w:sdt");
  if (sdtStart === -1) return xml;

  // The content after <w:sdt (including any attributes and the > char)
  const afterSdtOpen = xml.indexOf(">", sdtStart) + 1;

  // Find the matching </w:sdt>
  const sdtEnd = findMatchingClose(xml, "<w:sdt", "</w:sdt>", afterSdtOpen);
  if (sdtEnd === -1) return xml;

  const sdtBlock = xml.slice(sdtStart, sdtEnd);

  // Remove <w:showingPlcHdr/> (stop showing placeholder)
  let newBlock = sdtBlock.replace(/<w:showingPlcHdr\/>/g, "");

  // Find the <w:sdtContent>...</w:sdtContent> within this block
  const sdtContentStart = newBlock.indexOf("<w:sdtContent>");
  if (sdtContentStart === -1) return xml;

  const afterSdtContentOpen = sdtContentStart + "<w:sdtContent>".length;
  const sdtContentEnd = findMatchingClose(newBlock, "<w:sdtContent>", "</w:sdtContent>", afterSdtContentOpen);
  if (sdtContentEnd === -1) return xml;

  const originalContent = newBlock.slice(afterSdtContentOpen, sdtContentEnd - "</w:sdtContent>".length);
  const replacement = buildSdtContent(originalContent, value);

  newBlock = newBlock.slice(0, sdtContentStart) + replacement + newBlock.slice(sdtContentEnd);

  return xml.slice(0, sdtStart) + newBlock + xml.slice(sdtEnd);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Extract all content control tag names from a base64-encoded .docx.
 */
export async function extractDocxVariableNames(docxBase64: string): Promise<string[]> {
  const buffer = Buffer.from(docxBase64, "base64");
  const zip = await JSZip.loadAsync(buffer);

  const docFile = zip.file("word/document.xml");
  if (!docFile) return [];

  const xml = await docFile.async("string");

  const tagPattern = /<w:tag[^>]+w:val="([^"]+)"/g;
  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(xml)) !== null) {
    if (!names.includes(match[1])) names.push(match[1]);
  }
  return names;
}

/**
 * Fill content controls in a base64-encoded .docx with the given tag→value map.
 * Returns the filled .docx as a Uint8Array.
 */
export async function fillDocx(
  docxBase64: string,
  values: Record<string, string>
): Promise<Uint8Array> {
  const buffer = Buffer.from(docxBase64, "base64");
  const zip = await JSZip.loadAsync(buffer);

  const docFile = zip.file("word/document.xml");
  if (!docFile) return zip.generateAsync({ type: "uint8array" });

  let xml = await docFile.async("string");

  for (const [tagName, value] of Object.entries(values)) {
    if (value == null || value === "") continue;
    xml = replaceSdtContent(xml, tagName, value);
  }

  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "uint8array" });
}

// ── Fuzzy matching: Matrix column names → .docx tag names ─────────────────────

function normalizeToWords(name: string): string[] {
  // Split camelCase: "GoverningLaw" → ["governing", "law"]
  const spaced = name.replace(/([A-Z])/g, " $1");
  return spaced
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function jaccardScore(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Given a map of { columnName: extractedValue } and a list of .docx tag names,
 * return a map of { tagName: value } using fuzzy matching.
 * Only includes entries where a reasonable match was found (score > 0).
 */
export function mapColumnsToTags(
  columnValues: Record<string, string>,
  tagNames: string[]
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const tagName of tagNames) {
    const tagWords = normalizeToWords(tagName);
    const tagNorm = tagWords.join("");

    let bestCol: string | null = null;
    let bestScore = 0;

    for (const colName of Object.keys(columnValues)) {
      const colNorm = colName.toLowerCase().replace(/[^a-z0-9]/g, "");

      // Exact match (case-insensitive, ignoring non-alphanumeric)
      if (colNorm === tagNorm) {
        bestCol = colName;
        bestScore = 1.0;
        break;
      }

      const score = jaccardScore(normalizeToWords(colName), tagWords);
      if (score > bestScore) {
        bestScore = score;
        bestCol = colName;
      }
    }

    // Threshold: require at least one word overlap
    if (bestCol !== null && bestScore > 0) {
      const val = columnValues[bestCol];
      if (val != null && val !== "") {
        result[tagName] = val;
      }
    }
  }

  return result;
}
