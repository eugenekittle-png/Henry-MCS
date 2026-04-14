import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";

// Map of video names to their Vercel Blob URLs (stored as env vars, never exposed client-side)
const VIDEO_SOURCES: Record<string, string | undefined> = {
  "overview": process.env.BLOB_VIDEO_OVERVIEW,
};

export async function HEAD(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });
  const { name } = await params;
  const blobUrl = VIDEO_SOURCES[name];
  return new Response(null, { status: blobUrl ? 200 : 404 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { name } = await params;
  const blobUrl = VIDEO_SOURCES[name];
  if (!blobUrl) {
    return new Response("Video not found", { status: 404 });
  }

  // Forward any Range header from the browser so seeking works correctly
  const rangeHeader = req.headers.get("range");
  const fetchHeaders: HeadersInit = rangeHeader ? { Range: rangeHeader } : {};

  const blobRes = await fetch(blobUrl, { headers: fetchHeaders });
  if (!blobRes.ok && blobRes.status !== 206) {
    return new Response("Failed to fetch video", { status: 502 });
  }

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", blobRes.headers.get("Content-Type") ?? "video/mp4");
  responseHeaders.set("Accept-Ranges", "bytes");
  responseHeaders.set("Cache-Control", "private, no-store");

  // Forward Content-Range and Content-Length if present (needed for range requests)
  const contentRange = blobRes.headers.get("Content-Range");
  const contentLength = blobRes.headers.get("Content-Length");
  if (contentRange) responseHeaders.set("Content-Range", contentRange);
  if (contentLength) responseHeaders.set("Content-Length", contentLength);

  return new Response(blobRes.body, {
    status: blobRes.status,
    headers: responseHeaders,
  });
}
