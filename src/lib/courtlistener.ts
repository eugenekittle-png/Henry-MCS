const CL_BASE = "https://www.courtlistener.com/api/rest/v4";
const MAX_TEXT_LENGTH = 120_000;
const TEXT_FIELDS = ["plain_text", "html_with_citations", "html_lawbox", "html_columbia", "html_anon_2020", "html"];

function clHeaders(): HeadersInit {
  const key = process.env.COURTLISTENER_API_KEY;
  return key ? { Authorization: `Token ${key}` } : {};
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s{3,}/g, "\n\n")
    .trim();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractText(op: any): string {
  for (const field of TEXT_FIELDS) {
    const raw: string = op[field]?.trim() ?? "";
    if (!raw) continue;
    const text = field === "plain_text" ? raw : stripHtml(raw);
    if (text.length > 200) return text.slice(0, MAX_TEXT_LENGTH);
  }
  return "";
}

/**
 * Fetch the full opinion text for a CourtListener cluster ID.
 * Returns the text string, or null if unavailable.
 * Callable server-side without HTTP round-trip.
 */
export async function fetchCourtListenerText(clusterId: string | number): Promise<string | null> {
  try {
    // Step 1: get opinion stubs for this cluster
    const listRes = await fetch(`${CL_BASE}/opinions/?cluster=${clusterId}&format=json&page_size=10`, { headers: clHeaders() });
    if (!listRes.ok) return null;
    const data = await listRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stubs: any[] = data.results ?? [];

    // Step 2: if no stubs, try cluster endpoint for sub_opinions links
    if (!stubs.length) {
      const clusterRes = await fetch(`${CL_BASE}/clusters/${clusterId}/?format=json`, { headers: clHeaders() });
      if (clusterRes.ok) {
        const cluster = await clusterRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stubs = (cluster.sub_opinions ?? []).map((url: any) => ({ _url: url }));
      }
    }

    // Step 3: fetch each opinion individually and try all text fields
    for (const stub of stubs) {
      const opUrl: string = stub._url
        ? `${stub._url}${stub._url.includes("?") ? "&" : "?"}format=json`
        : `${CL_BASE}/opinions/${stub.id}/?format=json`;
      const opRes = await fetch(opUrl, { headers: clHeaders() });
      if (!opRes.ok) continue;
      const op = await opRes.json();
      const text = extractText(op);
      if (text) return text;
    }

    return null;
  } catch {
    return null;
  }
}
