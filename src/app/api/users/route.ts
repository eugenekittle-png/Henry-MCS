import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import { getAllUsers, dbCreateUser, getUserByUsername } from "@/lib/db";
import { validatePassword } from "@/lib/password";
import { logAction, getClientIp } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const users = await getAllUsers();
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const ip = getClientIp(request);
  const { username, password, role } = await request.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }
  const pwError = validatePassword(password);
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 });
  }
  if (role !== "admin" && role !== "user") {
    return NextResponse.json({ error: "Role must be 'admin' or 'user'" }, { status: 400 });
  }

  const existing = await getUserByUsername(username.toLowerCase());
  if (existing) {
    return NextResponse.json({ error: "Username already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await dbCreateUser(username, passwordHash, role);
  await logAction({ username: session.username, action: "User-Create", details: { targetUser: username.toLowerCase(), role }, success: true, ipAddress: ip });
  return NextResponse.json(user, { status: 201 });
}
