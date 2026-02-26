import JSZip from "jszip";
import { parseFile } from "./index";
import type { ParsedDocument } from "@/types";

export async function parseZip(buffer: Buffer): Promise<ParsedDocument[]> {
  const zip = await JSZip.loadAsync(buffer);
  const documents: ParsedDocument[] = [];

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;

    // Skip hidden/system files
    const name = path.split("/").pop() || path;
    if (name.startsWith(".") || name.startsWith("__")) continue;

    const ext = name.substring(name.lastIndexOf(".")).toLowerCase();
    const supportedExts = [".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".md", ".csv"];
    if (!supportedExts.includes(ext)) continue;

    try {
      const fileBuffer = Buffer.from(await file.async("arraybuffer"));
      const content = await parseFile(fileBuffer, name);
      documents.push({
        name: path,
        content,
        type: ext,
        size: fileBuffer.length,
      });
    } catch {
      documents.push({
        name: path,
        content: `(Failed to parse file)`,
        type: ext,
        size: 0,
      });
    }
  }

  return documents;
}
