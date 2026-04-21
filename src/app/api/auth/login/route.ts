import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, setSessionCookie, setPending2faCookie, setPendingSetupCookie } from "@/lib/auth";
import { getUserByEmail, incrementFailedLogins, resetFailedLogins, getSetting, getUserForAuth, updateLastLogin, getUserPages } from "@/lib/db";
import { logAction, getClientIp } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();
  const ip = getClientIp(request);

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const user = await getUserByEmail(email.toLowerCase());
  if (!user) {
    await logAction({ username: email.toLowerCase(), action: "Login", details: { reason: "user not found" }, success: false, ipAddress: ip });
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // Check lockout
  if (user.locked_until) {
    const lockedUntil = new Date(user.locked_until + "Z");
    if (lockedUntil > new Date()) {
      const isDisabled = user.locked_until.startsWith("9999");
      await logAction({ username: user.email, action: "Login", details: { reason: isDisabled ? "account disabled" : "account locked", lockedUntil: user.locked_until }, success: false, ipAddress: ip });
      const errorMsg = isDisabled
        ? "This account has been disabled. Please contact your administrator."
        : `Account is temporarily locked due to too many failed attempts. Try again in ${Math.ceil((lockedUntil.getTime() - Date.now()) / 60000)} minute${Math.ceil((lockedUntil.getTime() - Date.now()) / 60000) !== 1 ? "s" : ""}.`;
      return NextResponse.json({ error: errorMsg }, { status: 423 });
    }
    await resetFailedLogins(user.id);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await incrementFailedLogins(user.id);
    const attempts = user.failed_login_attempts + 1;
    await logAction({
      username: user.email,
      action: "Login",
      details: { reason: "invalid password", failedAttempts: attempts, locked: attempts >= 5 },
      success: false,
      ipAddress: ip,
    });
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await resetFailedLogins(user.id);

  // Check 2FA
  const fullUser = await getUserForAuth(user.id);
  if (fullUser?.totp_enabled) {
    await setPending2faCookie(user.id);
    await logAction({ username: user.email, action: "Login", details: { step: "2fa-required" }, success: true, ipAddress: ip });
    return NextResponse.json({ requires2FA: true });
  }

  // Check if firm requires 2FA and user hasn't set it up
  const require2fa = await getSetting("require_2fa");
  if (require2fa === "1" && !fullUser?.totp_enabled) {
    await setPendingSetupCookie(user.id);
    await logAction({ username: user.email, action: "Login", details: { step: "2fa-setup-required" }, success: true, ipAddress: ip });
    return NextResponse.json({ requiresSetup: true });
  }

  // No 2FA required — issue full session
  await updateLastLogin(user.id);
  const pages = await getUserPages(user.id);
  await setSessionCookie({ userId: user.id, username: user.username, email: user.email, role: user.role as "admin" | "user", mustChangePassword: user.must_change_password, pages });
  await logAction({ username: user.email, action: "Login", details: { role: user.role }, success: true, ipAddress: ip });

  return NextResponse.json({ ok: true, username: user.username, email: user.email, role: user.role, mustChangePassword: user.must_change_password, pages });
}
