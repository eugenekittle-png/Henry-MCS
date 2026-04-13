import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getUserForAuth, disableUserTotp } from "@/lib/db";
import { verifyToken } from "@/lib/totp";
import { logAction, getClientIp } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserForAuth(session.userId);
  if (!user || !user.totp_secret || !user.totp_enabled) {
    return NextResponse.json({ error: "2FA is not enabled" }, { status: 400 });
  }

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "Current 2FA code is required to disable" }, { status: 400 });

  const isValid = await verifyToken(token.replace(/\s/g, ""), user.totp_secret);
  if (!isValid) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  await disableUserTotp(session.userId);
  await logAction({ username: session.email, action: "2FA-Disabled", details: { self: true }, success: true, ipAddress: getClientIp(req) });
  return NextResponse.json({ ok: true });
}
