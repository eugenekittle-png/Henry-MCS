import { NextRequest, NextResponse } from "next/server";
import { getSession, verifyPassword, hashPassword, setSessionCookie } from "@/lib/auth";
import { getUserByUsername, updateUserPassword } from "@/lib/db";
import { validatePassword } from "@/lib/password";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { password } = await request.json();

  const validationError = validatePassword(password);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  // Ensure new password is not the same as current
  const user = await getUserByUsername(session.username);
  if (user) {
    const sameAsOld = await verifyPassword(password, user.password_hash);
    if (sameAsOld) {
      return NextResponse.json({ error: "New password cannot be the same as your current password" }, { status: 400 });
    }
  }

  const passwordHash = await hashPassword(password);
  await updateUserPassword(session.userId, passwordHash, false);

  // Refresh session cookie with mustChangePassword = false
  await setSessionCookie({
    userId: session.userId,
    username: session.username,
    role: session.role,
    mustChangePassword: false,
  });

  return NextResponse.json({ ok: true });
}
