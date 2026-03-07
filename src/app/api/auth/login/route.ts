import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, setSessionCookie } from "@/lib/auth";
import { getUserByUsername } from "@/lib/db";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  const user = await getUserByUsername(username.toLowerCase());
  if (!user) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  await setSessionCookie({ userId: user.id, username: user.username, role: user.role, mustChangePassword: user.must_change_password });

  return NextResponse.json({ ok: true, username: user.username, role: user.role, mustChangePassword: user.must_change_password });
}
