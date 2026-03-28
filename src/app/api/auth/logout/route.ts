import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, getSession } from "@/lib/auth";
import { logAction, getClientIp } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const session = await getSession();
  const ip = getClientIp(request);
  await clearSessionCookie();
  await logAction({ username: session?.username ?? null, action: "Logout", success: true, ipAddress: ip });
  return NextResponse.json({ ok: true });
}
