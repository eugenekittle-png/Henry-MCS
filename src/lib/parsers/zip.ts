import JSZip from "jszip";
import { parseFile } from "./index";
import { parseImage, IMAGE_EXTS } from "./image";
import type { ParsedDocument } from "@/types";

const EXTRACTABLE_EXTS = new Set([".pdf", ".doc", ".docx", ".xlsx", ".pptx", ".txt", ".md", ".csv"]);
const MAX_AUTO_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

interface ZipEntry {
  path: string;
  name: string;
  buffer: Buffer;
}

async function collectEntries(zip: JSZip): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [];
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    if (path.includes("__MACOSX/")) continue;
    const name = path.split("/").pop() || path;
    if (name.startsWith(".") || name.startsWith("__")) continue;
    const ext = name.includes(".") ? name.substring(name.lastIndexOf(".")).toLowerCase() : "";
    const isExtractable = EXTRACTABLE_EXTS.has(ext);
    const isImage = IMAGE_EXTS.has(ext);
    if (!isExtractable && !isImage) continue;
    const buffer = Buffer.from(await file.async("arraybuffer"));
    // Only auto-include images up to 5 MB; larger images are skipped from batch
    if (isImage && buffer.length > MAX_AUTO_IMAGE_SIZE) continue;
    entries.push({ path, name, buffer });
  }
  return entries;
}

/**
 * Parse a zip file with optional per-file progress callback.
 * Files are parsed with limited concurrency (5 at a time) for speed.
 */
export async function parseZip(
  buffer: Buffer,
  onProgress?: (current: number, total: number, name: string) => void
): Promise<ParsedDocument[]> {
  const zip = await JSZip.loadAsync(buffer);
  const entries = await collectEntries(zip);
  const total = entries.length;
  const results: ParsedDocument[] = new Array(entries.length);

  // Process up to 5 files concurrently
  const CONCURRENCY = 5;
  let index = 0;
  let completed = 0;

  async function processNext(): Promise<void> {
    while (index < entries.length) {
      const i = index++;
      const { path, name, buffer: fileBuffer } = entries[i];
      const ext = name.substring(name.lastIndexOf(".")).toLowerCase();
      try {
        if (IMAGE_EXTS.has(ext)) {
          const imageData = await parseImage(fileBuffer, name);
          results[i] = { name: path, content: "(image)", type: ext, size: fileBuffer.length, imageData };
        } else {
          let content = "";
          let parseError = false;
          try {
            content = await parseFile(fileBuffer, name);
          } catch {
            parseError = true;
          }
          // Fall back to Claude native PDF reading if: parse failed (corrupt/bad XRef) or scanned (< 100 chars)
          if (ext === ".pdf" && (parseError || content.trim().length < 100)) {
            results[i] = { name: path, content: "(unreadable PDF)", type: ext, size: fileBuffer.length, pdfData: fileBuffer.toString("base64") };
          } else if (parseError) {
            results[i] = { name: path, content: "(Failed to parse file)", type: ext, size: 0 };
          } else {
            results[i] = { name: path, content, type: ext, size: fileBuffer.length };
          }
        }
      } catch {
        results[i] = { name: path, content: "(Failed to parse file)", type: ext, size: 0 };
      }
      completed++;
      onProgress?.(completed, total, name);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, entries.length) }, processNext);
  await Promise.all(workers);

  return results.filter(Boolean);
}
