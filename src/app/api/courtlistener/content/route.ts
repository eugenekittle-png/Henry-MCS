import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";

const CL_BASE = "https://www.courtlistener.com/api/rest/v4";
const MAX_TEXT_LENGTH = 120_000;

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

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const clusterId = req.nextUrl.searchParams.get("clusterId");
  if (!clusterId) return Response.json({ error: "clusterId is required" }, { status: 400 });

  try {
    // Get the opinion stubs for this cluster (list endpoint omits body text fields)
    const listRes = await fetch(`${CL_BASE}/opinions/?cluster=${clusterId}&format=json&page_size=5`, { headers: clHeaders() });
    if (!listRes.ok) throw new Error(`CourtListener API error: ${listRes.status}`);

    const data = await listRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stubs: any[] = data.results ?? [];

    // Always fetch each opinion individually — list endpoint never includes body text
    for (const stub of stubs) {
      const opId: string | number | undefined = stub.id;
      if (!opId) continue;
      const opRes = await fetch(`${CL_BASE}/opinions/${opId}/?format=json`, { headers: clHeaders() });
      if (!opRes.ok) continue;
      const op = await opRes.json();
      let text: string = op.plain_text?.trim() ?? "";
      if (!text && op.html_with_citations) text = stripHtml(op.html_with_citations).trim();
      if (!text && op.html) text = stripHtml(op.html).trim();
      if (text.length > 200) {
        return Response.json({ text: text.slice(0, MAX_TEXT_LENGTH) });
      }
    }

    return Response.json({ error: "Opinion text is not available for this case" }, { status: 404 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Content fetch failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
