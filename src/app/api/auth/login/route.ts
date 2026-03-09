import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { getUserByUsername } from "@/lib/db";
import { logAction } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  const user = await getUserByUsername(username.toLowerCase());
  if (!user) {
    await logAction({ username: username.toLowerCase(), action: "login", details: { reason: "user not found" }, success: false });
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await logAction({ username: user.username, action: "login", details: { reason: "invalid password" }, success: false });
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  await setSessionCookie({ userId: user.id, username: user.username, role: user.role, mustChangePassword: user.must_change_password });
  await logAction({ username: user.username, action: "login", details: { role: user.role, mustChangePassword: user.must_change_password }, success: true });

  return NextResponse.json({ ok: true, username: user.username, role: user.role, mustChangePassword: user.must_change_password });
}
