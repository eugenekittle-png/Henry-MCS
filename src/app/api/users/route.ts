import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import { getAllUsers, dbCreateUser, getGroups, setUserGroups } from "@/lib/db";
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
  const { email, password, role, first_name, last_name } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }
  const pwError = validatePassword(password);
  if (pwError) {
    return NextResponse.json({ error: pwError }, { status: 400 });
  }
  if (role !== "admin" && role !== "user") {
    return NextResponse.json({ error: "Role must be 'admin' or 'user'" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  try {
    const user = await dbCreateUser(email, passwordHash, role, first_name?.trim() || undefined, last_name?.trim() || undefined);
    // Auto-assign new users to the default group
    if (user && role === "user") {
      const groups = await getGroups();
      const defaultGroup = groups.find(g => g.is_default);
      if (defaultGroup) await setUserGroups(user.id, [defaultGroup.id]);
    }
    await logAction({ username: session.email, action: "User-Create", details: { targetEmail: email.toLowerCase(), role }, success: true, ipAddress: ip });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create user";
    if (msg.includes("Email already in use")) return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
