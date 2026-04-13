import { NextRequest, NextResponse } from "next/server";
import { getPending2faUserId, clearPendingCookies, setSessionCookie } from "@/lib/auth";
import { getUserForAuth, updateUserBackupCodes, updateLastLogin } from "@/lib/db";
import { verifyToken } from "@/lib/totp";
import { logAction, getClientIp } from "@/lib/audit";

async function hashCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code.replace(/-/g, "").toUpperCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const userId = await getPending2faUserId();
  if (!userId) return NextResponse.json({ error: "No pending verification" }, { status: 401 });

  const user = await getUserForAuth(userId);
  if (!user || !user.totp_secret) return NextResponse.json({ error: "2FA not configured" }, { status: 400 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "Code is required" }, { status: 400 });

  // Try TOTP first
  const isValidTotp = await verifyToken(token.replace(/\s/g, ""), user.totp_secret);

  if (isValidTotp) {
    await updateLastLogin(user.id);
    await clearPendingCookies();
    await setSessionCookie({ userId: user.id, username: user.username, email: user.email ?? "", role: user.role as "admin" | "user", mustChangePassword: !!user.must_change_password });
    await logAction({ username: user.email ?? user.username, action: "Login", details: { step: "2fa-verified" }, success: true, ipAddress: ip });
    return NextResponse.json({ ok: true, username: user.username, email: user.email ?? "", role: user.role, mustChangePassword: !!user.must_change_password });
  }

  // Try backup codes
  const storedCodes: string[] = JSON.parse(user.totp_backup_codes ?? "[]");
  const inputHash = await hashCode(token);
  const matchIndex = storedCodes.indexOf(inputHash);

  if (matchIndex !== -1) {
    // Remove used backup code
    const remaining = storedCodes.filter((_, i) => i !== matchIndex);
    await updateUserBackupCodes(userId, JSON.stringify(remaining));
    await updateLastLogin(user.id);
    await clearPendingCookies();
    await setSessionCookie({ userId: user.id, username: user.username, email: user.email ?? "", role: user.role as "admin" | "user", mustChangePassword: !!user.must_change_password });
    await logAction({ username: user.email ?? user.username, action: "Login", details: { step: "2fa-backup-code-used", remaining: remaining.length }, success: true, ipAddress: ip });
    return NextResponse.json({ ok: true, username: user.username, email: user.email ?? "", role: user.role, mustChangePassword: !!user.must_change_password, usedBackupCode: true, remainingBackupCodes: remaining.length });
  }

  await logAction({ username: user.email ?? user.username, action: "Login", details: { step: "2fa-failed" }, success: false, ipAddress: ip });
  return NextResponse.json({ error: "Invalid code" }, { status: 401 });
}
