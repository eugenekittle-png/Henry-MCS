import { NextRequest } from "next/server";

const EDGAR_HEADERS = {
  "User-Agent": "HenryMCS research@henry-mcs.com",
  "Accept": "*/*",
};

const MAX_TEXT_LENGTH = 120_000;

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
  const cik = req.nextUrl.searchParams.get("cik");
  const accession = req.nextUrl.searchParams.get("accession"); // e.g. 0000320193-24-000123

  if (!cik || !accession) {
    return Response.json({ error: "cik and accession are required" }, { status: 400 });
  }

  try {
    const accessionNoDashes = accession.replace(/-/g, "");

    // Step 1: get the filing index to find the primary document
    const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}-index.json`;
    const indexRes = await fetch(indexUrl, { headers: EDGAR_HEADERS });

    let primaryDoc = "";
    let formType = "";
    if (indexRes.ok) {
      const idx = await indexRes.json();
      primaryDoc = idx.primaryDocument ?? "";
      formType = idx.form ?? "";
    }

    // Step 2: fetch the primary document HTML
    if (primaryDoc) {
      const docUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}/${primaryDoc}`;
      const docRes = await fetch(docUrl, { headers: EDGAR_HEADERS });
      if (docRes.ok) {
        const html = await docRes.text();
        const text = stripHtml(html).substring(0, MAX_TEXT_LENGTH);
        return Response.json({ text, formType });
      }
    }

    // Fallback: fetch the full submission text file (always exists, larger)
    const txtUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}.txt`;
    const txtRes = await fetch(txtUrl, { headers: EDGAR_HEADERS });
    if (txtRes.ok) {
      const raw = await txtRes.text();
      const text = stripHtml(raw).substring(0, MAX_TEXT_LENGTH);
      return Response.json({ text, formType });
    }

    return Response.json({ error: "Could not retrieve filing document" }, { status: 404 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Content fetch failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
