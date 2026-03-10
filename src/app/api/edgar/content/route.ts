import { NextRequest } from "next/server";

const EDGAR_HEADERS = { "User-Agent": "HenryMCS research@henry-mcs.com" };
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
  const accession = req.nextUrl.searchParams.get("accession");
  const primaryDocument = req.nextUrl.searchParams.get("primaryDocument");

  if (!cik || !accession) {
    return Response.json({ error: "cik and accession are required" }, { status: 400 });
  }

  try {
    const accessionNoDashes = accession.replace(/-/g, "");

    // If primaryDocument was supplied directly, use it
    const docFilename = primaryDocument || await fetchPrimaryDocument(cik, accessionNoDashes);

    if (docFilename) {
      const docUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}/${docFilename}`;
      const docRes = await fetch(docUrl, { headers: EDGAR_HEADERS });
      if (docRes.ok) {
        const html = await docRes.text();
        return Response.json({ text: stripHtml(html).substring(0, MAX_TEXT_LENGTH) });
      }
    }

    // Fallback: full submission text file
    const txtUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}.txt`;
    const txtRes = await fetch(txtUrl, { headers: EDGAR_HEADERS });
    if (txtRes.ok) {
      const raw = await txtRes.text();
      return Response.json({ text: stripHtml(raw).substring(0, MAX_TEXT_LENGTH) });
    }

    return Response.json({ error: "Could not retrieve filing document" }, { status: 404 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Content fetch failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function fetchPrimaryDocument(cik: string, accessionNoDashes: string): Promise<string> {
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}-index.json`;
  const res = await fetch(indexUrl, { headers: EDGAR_HEADERS });
  if (!res.ok) return "";
  const idx = await res.json();
  return idx.primaryDocument ?? "";
}
