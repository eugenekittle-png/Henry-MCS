import { cookies } from "next/headers";
import { getUserLockStatus } from "@/lib/db";

export { hashPassword, verifyPassword } from "@/lib/password";

const AUTH_SECRET = process.env.AUTH_SECRET || "henry-mcs-dev-secret-change-in-prod";
const SESSION_COOKIE = "henry_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type UserRole = "admin" | "user";

export interface SessionPayload {
  userId: number;
  username: string; // Principal ID (U-XXXXXX)
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
  pages: string[]; // page keys the user can access (empty for admin — admin bypasses all checks)
  exp: number;
}

// Admin always has access; non-admins must have the page in their session
export function hasPage(session: SessionPayload, pageKey: string): boolean {
  if (session.role === "admin") return true;
  return session.pages.includes(pageKey);
}

// --- Session signing key ---

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

// --- Session token (HMAC-signed JSON) ---

export async function getSessionFromRequest(req: Request): Promise<SessionPayload | null> {
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const session = await verifySessionToken(authHeader.slice(7));
    if (session) return session;
  }
  return getSession();
}

export async function createSessionToken(payload: Omit<SessionPayload, "exp">): Promise<string> {
  const data: SessionPayload = { ...payload, exp: Date.now() + SESSION_MAX_AGE * 1000 };
  const json = JSON.stringify(data);
  const encoded = Buffer.from(json).toString("base64url");
  const key = await getKey(AUTH_SECRET);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `${encoded}.${sigHex}`;
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const [encoded, sigHex] = token.split(".");
  if (!encoded || !sigHex) return null;

  try {
    const key = await getKey(AUTH_SECRET);
    const sig = new Uint8Array(sigHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(encoded));
    if (!valid) return null;

    const json = Buffer.from(encoded, "base64url").toString();
    const payload: SessionPayload = JSON.parse(json);
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// --- Cookie helpers (for use in API routes / server components) ---

export async function setSessionCookie(payload: Omit<SessionPayload, "exp">): Promise<string> {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return token;
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;

  // Check DB to ensure the user hasn't been disabled since this session was created
  const lockStatus = await getUserLockStatus(payload.userId);
  if (lockStatus?.locked_until) {
    const lockedUntil = new Date(lockStatus.locked_until + "Z");
    if (lockedUntil > new Date()) {
      cookieStore.delete(SESSION_COOKIE);
      return null;
    }
  }

  return payload;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// --- Pending 2FA cookies ---

const PENDING_2FA_COOKIE = "henry_pending_2fa";
const PENDING_SETUP_COOKIE = "henry_pending_setup";
const PENDING_MAX_AGE = 60 * 10; // 10 minutes

export async function setPending2faCookie(userId: number): Promise<void> {
  const payload = { userId, exp: Date.now() + PENDING_MAX_AGE * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await getKey(AUTH_SECRET);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  const token = `${encoded}.${sigHex}`;
  const cookieStore = await cookies();
  cookieStore.set(PENDING_2FA_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: PENDING_MAX_AGE, path: "/" });
}

export async function setPendingSetupCookie(userId: number): Promise<void> {
  const payload = { userId, exp: Date.now() + 60 * 30 * 1000 }; // 30 min to complete setup
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await getKey(AUTH_SECRET);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  const token = `${encoded}.${sigHex}`;
  const cookieStore = await cookies();
  cookieStore.set(PENDING_SETUP_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 30, path: "/" });
}

async function verifyPendingToken(token: string): Promise<{ userId: number } | null> {
  const [encoded, sigHex] = token.split(".");
  if (!encoded || !sigHex) return null;
  try {
    const key = await getKey(AUTH_SECRET);
    const sig = new Uint8Array(sigHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
    const valid = await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(encoded));
    if (!valid) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (payload.exp < Date.now()) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

export async function getPending2faUserId(): Promise<number | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PENDING_2FA_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyPendingToken(token);
  return payload?.userId ?? null;
}

export async function getPendingSetupUserId(): Promise<number | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PENDING_SETUP_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyPendingToken(token);
  return payload?.userId ?? null;
}

export async function clearPendingCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(PENDING_2FA_COOKIE);
  cookieStore.delete(PENDING_SETUP_COOKIE);
}
