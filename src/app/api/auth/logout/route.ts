import { NextResponse } from "next/server";
import { clearSessionCookie, getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export async function POST() {
  const session = await getSession();
  await clearSessionCookie();
  await logAction({ username: session?.username ?? null, action: "logout", success: true });
  return NextResponse.json({ ok: true });
}
