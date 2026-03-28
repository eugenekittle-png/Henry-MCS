import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { getUserByUsername, incrementFailedLogins, resetFailedLogins } from "@/lib/db";
import { logAction, getClientIp } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();
  const ip = getClientIp(request);

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  const user = await getUserByUsername(username.toLowerCase());
  if (!user) {
    await logAction({ username: username.toLowerCase(), action: "Login", details: { reason: "user not found" }, success: false, ipAddress: ip });
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  // Check lockout
  if (user.locked_until) {
    const lockedUntil = new Date(user.locked_until + "Z");
    if (lockedUntil > new Date()) {
      const secondsLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 1000);
      const minutesLeft = Math.ceil(secondsLeft / 60);
      await logAction({ username: user.username, action: "Login", details: { reason: "account locked", lockedUntil: user.locked_until }, success: false, ipAddress: ip });
      return NextResponse.json(
        { error: `Account is temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}.` },
        { status: 423 }
      );
    }
    // Lock expired — clear it
    await resetFailedLogins(user.username);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await incrementFailedLogins(user.username);
    // Re-fetch to get updated count for the log details
    const updated = await getUserByUsername(user.username);
    const attempts = updated?.failed_login_attempts ?? user.failed_login_attempts + 1;
    await logAction({
      username: user.username,
      action: "Login",
      details: { reason: "invalid password", failedAttempts: attempts, locked: attempts >= 5 },
      success: false,
      ipAddress: ip,
    });
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  await resetFailedLogins(user.username);
  const token = await setSessionCookie({ userId: user.id, username: user.username, role: user.role, mustChangePassword: user.must_change_password });
  await logAction({ username: user.username, action: "Login", details: { role: user.role, mustChangePassword: user.must_change_password }, success: true, ipAddress: ip });

  return NextResponse.json({ ok: true, username: user.username, role: user.role, mustChangePassword: user.must_change_password, token });
}
