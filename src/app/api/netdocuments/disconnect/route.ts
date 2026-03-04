import { NextResponse } from "next/server";
import { clearTokensCookie } from "@/lib/netdocuments/tokens";

export async function POST() {
  await clearTokensCookie();
  return NextResponse.json({ ok: true });
}
