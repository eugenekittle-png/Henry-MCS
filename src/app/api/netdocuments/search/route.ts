import { NextRequest, NextResponse } from "next/server";
import { getValidTokens } from "@/lib/netdocuments/tokens";
import { searchDocuments } from "@/lib/netdocuments/api";

export async function GET(request: NextRequest) {
  const tokens = await getValidTokens();
  if (!tokens) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  const cabinet = request.nextUrl.searchParams.get("cabinet");
  const q = request.nextUrl.searchParams.get("q");

  if (!cabinet || !q) {
    return NextResponse.json({ error: "Missing cabinet or q parameter" }, { status: 400 });
  }

  try {
    const results = await searchDocuments(tokens, cabinet, q);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Search failed:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
