import { NextResponse } from "next/server";
import { getValidTokens } from "@/lib/netdocuments/tokens";

export async function GET() {
  const tokens = await getValidTokens();
  return NextResponse.json({ connected: tokens !== null });
}
