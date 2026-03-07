import { cookies } from "next/headers";

const AUTH_SECRET = process.env.AUTH_SECRET || "henry-mcs-dev-secret-change-in-prod";
const SESSION_COOKIE = "henry_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type UserRole = "admin" | "user";

export interface SessionPayload {
  userId: number;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
  exp: number;
}

// --- Password hashing with PBKDF2 ---

async function getKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const computed = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  return computed === hashHex;
}

// --- Session token (HMAC-signed JSON) ---

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

export async function setSessionCookie(payload: Omit<SessionPayload, "exp">) {
  const token = await createSessionToken(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
