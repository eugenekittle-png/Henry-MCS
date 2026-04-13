import { NextRequest } from "next/server";
import JSZip from "jszip";
import { MAX_BREAKDOWN_FILE_SIZE } from "@/lib/constants";
import { getSession } from "@/lib/auth";

export type FileStatus = "extractable" | "image" | "image_large" | "video" | "unsupported" | "skipped";

export interface ManifestFile {
  name: string;
  path: string;
  size: number;
  ext: string;
  status: FileStatus;
}

export interface ManifestSummary {
  extractable: number;
  image: number;
  image_large: number;
  video: number;
  unsupported: number;
  skipped: number;
  total: number;
}

export interface ManifestResponse {
  files: ManifestFile[];
  summary: ManifestSummary;
}

const EXTRACTABLE_EXTS = new Set([".pdf", ".doc", ".docx", ".xlsx", ".pptx", ".txt", ".md", ".csv"]);
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".tiff", ".tif", ".bmp", ".webp", ".heic", ".heif"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv", ".webm", ".m4v", ".mpg", ".mpeg", ".3gp"]);
// System/binary files that should always be silently skipped
const SYSTEM_EXTS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs",
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".db", ".sqlite",
]);

const MAX_AUTO_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

function classifyFile(name: string, size: number): FileStatus {
  if (name.startsWith(".") || name.startsWith("__") || name === "Thumbs.db" || name === "desktop.ini") {
    return "skipped";
  }
  const ext = name.includes(".") ? name.substring(name.lastIndexOf(".")).toLowerCase() : "";
  if (SYSTEM_EXTS.has(ext)) return "skipped";
  if (EXTRACTABLE_EXTS.has(ext)) return "extractable";
  if (IMAGE_EXTS.has(ext)) return size <= MAX_AUTO_IMAGE_SIZE ? "image" : "image_large";
  if (VIDEO_EXTS.has(ext)) return "video";
  return "unsupported";
}

function formatExt(name: string): string {
  return name.includes(".") ? name.substring(name.lastIndexOf(".")).toLowerCase() : "(none)";
}

export async function POST(req: NextRequest) {
  await getSession(); // auth check only

  try {
    const { blobUrl, fileName } = await req.json();

    if (!blobUrl || !blobUrl.includes("blob.vercel-storage.com")) {
      return Response.json({ error: "No valid blob URL provided" }, { status: 400 });
    }

    const name = (fileName as string) || "upload.zip";
    const ext = name.includes(".") ? name.substring(name.lastIndexOf(".")).toLowerCase() : "";
    if (ext !== ".zip") return Response.json({ error: "Please upload a .zip file" }, { status: 400 });

    const blobRes = await fetch(blobUrl);
    if (!blobRes.ok) return Response.json({ error: "Failed to fetch uploaded file" }, { status: 400 });
    const buffer = Buffer.from(await blobRes.arrayBuffer());

    if (buffer.length > MAX_BREAKDOWN_FILE_SIZE) return Response.json({ error: "File too large (max 50MB)" }, { status: 400 });
    const zip = await JSZip.loadAsync(buffer);

    const files: ManifestFile[] = [];
    const summary: ManifestSummary = { extractable: 0, image: 0, image_large: 0, video: 0, unsupported: 0, skipped: 0, total: 0 };

    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;

      // Strip macOS __MACOSX resource fork paths
      if (path.includes("__MACOSX/")) continue;

      const name = path.split("/").pop() || path;

      // Don't surface skipped files at all — pre-check by name before reading buffer
      const preStatus = classifyFile(name, 0);
      if (preStatus === "skipped") continue;

      const fileBuffer = Buffer.from(await entry.async("arraybuffer"));
      const status = classifyFile(name, fileBuffer.length);

      files.push({
        name,
        path,
        size: fileBuffer.length,
        ext: formatExt(name),
        status,
      });

      summary[status]++;
      summary.total++;
    }

    // Sort: extractable first, then image, then image_large, then video, then unsupported
    const ORDER: Record<FileStatus, number> = { extractable: 0, image: 1, image_large: 2, video: 3, unsupported: 4, skipped: 5 };
    files.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));

    return Response.json({ files, summary } satisfies ManifestResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
