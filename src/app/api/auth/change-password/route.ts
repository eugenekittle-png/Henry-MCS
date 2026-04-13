import { NextRequest, NextResponse } from "next/server";
import { getSession, verifyPassword, hashPassword, setSessionCookie } from "@/lib/auth";
import { getUserForAuth, updateUserPassword } from "@/lib/db";
import { validatePassword } from "@/lib/password";
import { logAction, getClientIp } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const { password } = await request.json();

  const validationError = validatePassword(password);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const user = await getUserForAuth(session.userId);
  if (user) {
    const sameAsOld = await verifyPassword(password, user.password_hash);
    if (sameAsOld) {
      await logAction({ username: session.email, action: "Change-Password", details: { reason: "same as current password" }, success: false, ipAddress: ip });
      return NextResponse.json({ error: "New password cannot be the same as your current password" }, { status: 400 });
    }
  }

  const passwordHash = await hashPassword(password);
  await updateUserPassword(session.userId, passwordHash, false);

  await setSessionCookie({ userId: session.userId, username: session.username, email: session.email, role: session.role, mustChangePassword: false });
  await logAction({ username: session.email, action: "Change-Password", success: true, ipAddress: ip });

  return NextResponse.json({ ok: true });
}
