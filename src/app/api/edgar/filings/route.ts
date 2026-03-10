import { NextRequest } from "next/server";

const EDGAR_HEADERS = { "User-Agent": "HenryMCS research@henry-mcs.com" };

export async function GET(req: NextRequest) {
  const cik = req.nextUrl.searchParams.get("cik");
  const type = req.nextUrl.searchParams.get("type") || "10-K";
  if (!cik) return Response.json({ error: "cik required" }, { status: 400 });

  try {
    const paddedCik = cik.padStart(10, "0");
    const res = await fetch(`https://data.sec.gov/submissions/CIK${paddedCik}.json`, {
      headers: EDGAR_HEADERS,
    });
    if (!res.ok) throw new Error(`SEC API error: ${res.status}`);

    const data = await res.json();
    const recent = data.filings?.recent ?? {};
    const forms: string[] = recent.form ?? [];
    const dates: string[] = recent.filingDate ?? [];
    const accessions: string[] = recent.accessionNumber ?? [];
    const primaryDocs: string[] = recent.primaryDocument ?? [];

    const results: { filingDate: string; accessionNo: string; primaryDocument: string }[] = [];
    for (let i = 0; i < forms.length; i++) {
      if (forms[i] === type) {
        results.push({ filingDate: dates[i], accessionNo: accessions[i], primaryDocument: primaryDocs[i] });
      }
      if (results.length >= 10) break;
    }

    return Response.json({ company: data.name ?? "", cik: data.cik ?? cik, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch filings";
    return Response.json({ error: message }, { status: 500 });
  }
}
