import { NextRequest } from "next/server";

const EDGAR_HEADERS = {
  "User-Agent": "HenryMCS research@henry-mcs.com",
  "Accept": "application/json",
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const forms = req.nextUrl.searchParams.get("forms") || "10-K,10-Q,8-K";

  if (!q) return Response.json({ error: "Query required" }, { status: 400 });

  try {
    const today = new Date().toISOString().split("T")[0];
    const url = new URL("https://efts.sec.gov/EFTS/api/getDisseminations");
    url.searchParams.set("q", `"${q}"`);
    url.searchParams.set("forms", forms);
    url.searchParams.set("dateRange", "custom");
    url.searchParams.set("startdt", "2018-01-01");
    url.searchParams.set("enddt", today);

    const res = await fetch(url.toString(), { headers: EDGAR_HEADERS });
    if (!res.ok) throw new Error(`EDGAR search error: ${res.status}`);

    const data = await res.json();
    const hits: any[] = data?.hits?.hits ?? []; // eslint-disable-line @typescript-eslint/no-explicit-any

    const results = hits.slice(0, 30).map((hit) => {
      const src = hit._source ?? {};
      const rawName: string = src.display_names?.[0] ?? "Unknown";
      const company = rawName.replace(/\s*\(CIK.*?\)/i, "").trim();
      const cik = (src.entity_id ?? "").replace(/^0+/, "");
      return {
        company,
        cik,
        formType: src.form_type ?? "",
        filingDate: src.file_date ?? "",
        period: src.period_of_report ?? "",
        accessionNo: src.accession_no ?? "",
      };
    }).filter(r => r.cik && r.accessionNo);

    return Response.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
