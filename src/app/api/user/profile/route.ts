import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, getPendingSetupUserId, setSessionCookie } from "@/lib/auth";
import { getUserForAuth, updateUserProfile } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const pendingUserId = await getPendingSetupUserId();
  const userId = session?.userId ?? pendingUserId;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getUserForAuth(userId);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    totp_enabled: !!user.totp_enabled,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, first_name, last_name } = await req.json();

  // Validate email if provided
  if (email !== undefined && email !== null && email !== "") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }
  }

  await updateUserProfile(session.userId, {
    ...(email !== undefined ? { email: email?.trim() || null } : {}),
    ...(first_name !== undefined ? { first_name: first_name?.trim() || null } : {}),
    ...(last_name !== undefined ? { last_name: last_name?.trim() || null } : {}),
  });

  // If email changed, refresh the session cookie so the new email is reflected
  if (email !== undefined) {
    await setSessionCookie({
      userId: session.userId,
      username: session.username,
      email: email?.trim() || session.email,
      role: session.role,
      mustChangePassword: session.mustChangePassword,
      pages: session.pages ?? [],
    });
  }

  return NextResponse.json({ ok: true });
}
