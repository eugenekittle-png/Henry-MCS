import { NextResponse } from "next/server";
import { getValidTokens } from "@/lib/netdocuments/tokens";
import { getCabinets } from "@/lib/netdocuments/api";

export async function GET() {
  const tokens = await getValidTokens();
  if (!tokens) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  try {
    const cabinets = await getCabinets(tokens);
    return NextResponse.json({ cabinets });
  } catch (err) {
    console.error("Failed to fetch cabinets:", err);
    return NextResponse.json({ error: "Failed to fetch cabinets" }, { status: 500 });
  }
}
