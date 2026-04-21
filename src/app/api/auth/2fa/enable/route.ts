import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, getPendingSetupUserId, clearPendingCookies, setSessionCookie } from "@/lib/auth";
import { getUserForAuth, setUserTotp, getUserPages } from "@/lib/db";
import { verifyToken } from "@/lib/totp";

async function hashCode(code: string): Promise<string> {
  const data = new TextEncoder().encode(code.replace(/-/g, "").toUpperCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function generateBackupCodes(): string[] {
  return Array.from({ length: 8 }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`.toUpperCase();
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  const pendingUserId = await getPendingSetupUserId();
  const userId = session?.userId ?? pendingUserId;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { secret, token } = await req.json();
  if (!secret || !token) return NextResponse.json({ error: "Secret and token are required" }, { status: 400 });

  const isValid = await verifyToken(token, secret);
  if (!isValid) return NextResponse.json({ error: "Invalid code — please try again" }, { status: 400 });

  const backupCodes = generateBackupCodes();
  const hashedCodes = await Promise.all(backupCodes.map(hashCode));
  await setUserTotp(userId, secret, JSON.stringify(hashedCodes));

  // If this was a forced setup, clear pending cookie and issue full session
  if (pendingUserId && !session) {
    const user = await getUserForAuth(userId);
    if (user) {
      await clearPendingCookies();
      const pages = await getUserPages(user.id);
      await setSessionCookie({ userId: user.id, username: user.username, email: user.email ?? "", role: user.role as "admin" | "user", mustChangePassword: !!user.must_change_password, pages });
    }
  }

  return NextResponse.json({ ok: true, backupCodes });
}
