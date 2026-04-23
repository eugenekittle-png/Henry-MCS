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
    // Fetch all opinions for this cluster
    const res = await fetch(`${CL_BASE}/opinions/?cluster=${clusterId}&format=json`, { headers: clHeaders() });
    if (!res.ok) throw new Error(`CourtListener API error: ${res.status}`);

    const data = await res.json();
    const opinions: Record<string, string>[] = data.results ?? [];

    // Try each opinion in the cluster for usable text
    for (const opinion of opinions) {
      let text = opinion.plain_text?.trim() ?? "";
      if (!text && opinion.html_with_citations) text = stripHtml(opinion.html_with_citations).trim();
      if (!text && opinion.html) text = stripHtml(opinion.html).trim();
      if (text.length > 200) {
        return Response.json({ text: text.slice(0, MAX_TEXT_LENGTH) });
      }
    }

    // Fallback: fetch each opinion URL directly in case the list endpoint omits body fields
    for (const opinion of opinions) {
      const opinionUrl = opinion.resource_uri ?? `${CL_BASE}/opinions/${opinion.id}/?format=json`;
      const opRes = await fetch(opinionUrl, { headers: clHeaders() });
      if (!opRes.ok) continue;
      const op = await opRes.json();
      let text = op.plain_text?.trim() ?? "";
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
