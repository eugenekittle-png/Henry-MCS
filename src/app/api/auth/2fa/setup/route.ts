import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, getPendingSetupUserId } from "@/lib/auth";
import { getUserForAuth } from "@/lib/db";
import { generateSecret, generateKeyUri } from "@/lib/totp";
import QRCode from "qrcode";

export async function GET(req: NextRequest) {
  // Allow both full session and pending setup
  const session = await getSessionFromRequest(req);
  const pendingUserId = await getPendingSetupUserId();
  const userId = session?.userId ?? pendingUserId;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserForAuth(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Generate a new secret
  const secret = generateSecret();
  const otpauth = generateKeyUri(user.username, secret);
  const qrDataUrl = await QRCode.toDataURL(otpauth);

  return NextResponse.json({ secret, qrDataUrl });
}
