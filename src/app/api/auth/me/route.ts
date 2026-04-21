import { NextResponse } from "next/server";
import { getSession, createSessionToken } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const token = await createSessionToken({ userId: session.userId, username: session.username, email: session.email, role: session.role, mustChangePassword: session.mustChangePassword, pages: session.pages ?? [] });
  return NextResponse.json({ user: { username: session.username, email: session.email, role: session.role, mustChangePassword: session.mustChangePassword, pages: session.pages ?? [] }, token });
}
