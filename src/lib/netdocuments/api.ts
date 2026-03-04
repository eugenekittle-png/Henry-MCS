import { ND_API_BASE } from "./config";
import type { NDCabinet, NDSearchResult, NDDocumentInfo, NetDocTokens } from "./types";

async function ndFetch(path: string, tokens: NetDocTokens, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${ND_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`NetDocuments API error ${res.status}: ${text}`);
  }

  return res;
}

export async function getCabinets(tokens: NetDocTokens): Promise<NDCabinet[]> {
  const res = await ndFetch("/User/cabinets", tokens);
  const data = await res.json();

  // API returns list of cabinet objects
  const list = Array.isArray(data) ? data : data.cabinets || [];
  return list.map((c: Record<string, unknown>) => ({
    id: String(c.id || c.cabinetId || c.guid),
    name: String(c.name || c.cabinetName || ""),
    repositoryId: String(c.repositoryId || c.repId || ""),
  }));
}

export async function searchDocuments(
  tokens: NetDocTokens,
  cabinetId: string,
  query: string
): Promise<NDSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const res = await ndFetch(`/Search/${cabinetId}?${params}`, tokens);
  const data = await res.json();

  const list = Array.isArray(data) ? data : data.documentList || data.results || [];
  return list.map((d: Record<string, unknown>) => ({
    id: String(d.id || d.docId || d.envId),
    name: String(d.name || d.docName || ""),
    extension: String(d.extension || d.ext || ""),
    version: Number(d.version || d.ver || 1),
    createdDate: String(d.created || d.createdDate || ""),
    modifiedDate: String(d.modified || d.modifiedDate || ""),
    size: Number(d.size || 0),
    envId: String(d.envId || d.id || d.docId || ""),
  }));
}

export async function getDocumentInfo(tokens: NetDocTokens, docId: string): Promise<NDDocumentInfo> {
  const res = await ndFetch(`/Document/${docId}/info`, tokens);
  const d = await res.json();
  return {
    id: String(d.id || d.docId || d.envId || docId),
    name: String(d.name || d.docName || ""),
    extension: String(d.extension || d.ext || ""),
    size: Number(d.size || 0),
    version: Number(d.version || d.ver || 1),
  };
}

export async function downloadDocument(tokens: NetDocTokens, docId: string): Promise<ArrayBuffer> {
  const res = await fetch(`${ND_API_BASE}/Document/${docId}`, {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: "application/octet-stream",
    },
  });

  if (!res.ok) {
    throw new Error(`Download failed: ${res.status}`);
  }

  return res.arrayBuffer();
}
