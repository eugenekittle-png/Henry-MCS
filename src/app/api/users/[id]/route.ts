import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import { getUser, updateUserRole, updateUserPassword, deleteUser, resetFailedLogins, disableUserTotp, updateUserProfile, disableUser } from "@/lib/db";
import { validatePassword } from "@/lib/password";
import { logAction, getClientIp } from "@/lib/audit";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const ip = getClientIp(request);
  const { id } = await params;
  const userId = Number(id);
  const user = await getUser(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { role, password, unlock, disable, enable, disable2fa, email, first_name, last_name } = await request.json();
  const changes: Record<string, unknown> = { targetUser: user.email ?? user.username };

  if (disable) {
    if (userId === session.userId) {
      return NextResponse.json({ error: "Cannot disable your own account" }, { status: 400 });
    }
    await disableUser(userId);
    changes.disabled = true;
  }

  if (enable || unlock) {
    await resetFailedLogins(userId);
    changes.enabled = true;
  }

  if (disable2fa) {
    await disableUserTotp(userId);
    changes.disable2fa = true;
  }

  const profileUpdate: { email?: string | null; first_name?: string | null; last_name?: string | null } = {};
  if (email !== undefined) { profileUpdate.email = email || null; changes.emailUpdated = true; }
  if (first_name !== undefined) { profileUpdate.first_name = first_name || null; }
  if (last_name !== undefined) { profileUpdate.last_name = last_name || null; }
  if (Object.keys(profileUpdate).length > 0) await updateUserProfile(userId, profileUpdate);

  if (role && role !== user.role) {
    if (role !== "admin" && role !== "user") {
      return NextResponse.json({ error: "Role must be 'admin' or 'user'" }, { status: 400 });
    }
    await updateUserRole(userId, role);
    changes.roleChanged = { from: user.role, to: role };
  }

  if (password) {
    const pwError = validatePassword(password);
    if (pwError) {
      return NextResponse.json({ error: pwError }, { status: 400 });
    }
    const passwordHash = await hashPassword(password);
    await updateUserPassword(userId, passwordHash, true);
    changes.passwordReset = true;
  }

  await logAction({ username: session.email, action: "User-Update", details: changes, success: true, ipAddress: ip });
  const updated = await getUser(userId);
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const ip = getClientIp(request);
  const { id } = await params;
  const userId = Number(id);

  if (userId === session.userId) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const user = await getUser(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await deleteUser(userId);
  await logAction({ username: session.email, action: "User-Delete", details: { targetUser: user.email ?? user.username }, success: true, ipAddress: ip });
  return NextResponse.json({ ok: true });
}
