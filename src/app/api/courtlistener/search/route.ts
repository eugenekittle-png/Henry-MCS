import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";

const CL_BASE = "https://www.courtlistener.com/api/rest/v4";
const MAX_RESULTS = 20;

function clHeaders(): HeadersInit {
  const key = process.env.COURTLISTENER_API_KEY;
  return key ? { Authorization: `Token ${key}` } : {};
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const court = req.nextUrl.searchParams.get("court") ?? "";
  const precedential = req.nextUrl.searchParams.get("precedential") === "1";
  if (!q) return Response.json({ error: "Query required" }, { status: 400 });

  try {
    const params = new URLSearchParams({ q, type: "o", format: "json", page_size: String(MAX_RESULTS) });
    if (court) params.set("court", court);
    if (precedential) params.set("stat_Precedential", "on");

    const res = await fetch(`${CL_BASE}/search/?${params}`, { headers: clHeaders() });
    if (!res.ok) throw new Error(`CourtListener API error: ${res.status}`);

    const data = await res.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = (data.results ?? []).map((r: any) => {
      // Extract cluster ID from the canonical URL — more reliable than field names
      // CourtListener opinion URLs are /opinion/{cluster_id}/{slug}/
      const absoluteUrl: string = r.absoluteUrl ?? r.absolute_url ?? "";
      const urlMatch = absoluteUrl.match(/\/opinion\/(\d+)\//);
      const clusterId: number = urlMatch ? parseInt(urlMatch[1]) : (r.cluster_id ?? r.id);

      const cites: string[] = Array.isArray(r.citation) ? r.citation : (r.citation ? [r.citation] : []);
      const citation = cites.find((c: string) => /\d+\s+U\.S\./.test(c)) ?? cites[0] ?? "";

      return {
        clusterId,
        caseName: r.caseName ?? r.case_name ?? "Unknown Case",
        court: r.court ?? "",
        dateFiled: r.dateFiled ?? r.date_filed ?? "",
        citation,
        snippet: r.snippet ?? "",
        absoluteUrl,
      };
    });

    return Response.json({ results, count: data.count ?? results.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
