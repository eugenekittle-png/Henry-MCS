import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import { getUser, updateUserRole, updateUserPassword, deleteUser } from "@/lib/db";
import { validatePassword } from "@/lib/password";

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const userId = Number(id);
  const user = await getUser(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { role, password } = await request.json();

  if (role && role !== user.role) {
    if (role !== "admin" && role !== "user") {
      return NextResponse.json({ error: "Role must be 'admin' or 'user'" }, { status: 400 });
    }
    await updateUserRole(userId, role);
  }

  if (password) {
    const pwError = validatePassword(password);
    if (pwError) {
      return NextResponse.json({ error: pwError }, { status: 400 });
    }
    const passwordHash = await hashPassword(password);
    await updateUserPassword(userId, passwordHash, true);
  }

  const updated = await getUser(userId);
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

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
  return NextResponse.json({ ok: true });
}
