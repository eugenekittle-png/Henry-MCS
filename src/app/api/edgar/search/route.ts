import { NextRequest } from "next/server";

const EDGAR_HEADERS = { "User-Agent": "HenryMCS research@henry-mcs.com" };

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase();
  if (!q) return Response.json({ error: "Query required" }, { status: 400 });

  try {
    // company_tickers.json is the SEC's official company list (~1.5MB, cached 24h)
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: EDGAR_HEADERS,
      next: { revalidate: 86400 },
    });
    if (!res.ok) throw new Error(`SEC API error: ${res.status}`);

    const data: Record<string, { cik_str: number; ticker: string; title: string }> = await res.json();

    const results = Object.values(data)
      .filter(c => c.title.toLowerCase().includes(q) || c.ticker.toLowerCase() === q)
      .slice(0, 25)
      .map(c => ({ cik: String(c.cik_str), name: c.title, ticker: c.ticker }));

    return Response.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
