import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import type { NetDocTokens } from "./types";
import {
  ND_CLIENT_ID,
  ND_CLIENT_SECRET,
  ND_TOKEN_URL,
  ND_COOKIE_NAME,
  ND_COOKIE_MAX_AGE,
  ND_TOKEN_REFRESH_BUFFER,
} from "./config";

function getEncryptionKey(): Buffer {
  return createHash("sha256").update(ND_CLIENT_SECRET).digest();
}

export function encryptTokens(tokens: NetDocTokens): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = JSON.stringify(tokens);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all base64)
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptTokens(encoded: string): NetDocTokens | null {
  try {
    const key = getEncryptionKey();
    const [ivB64, tagB64, dataB64] = encoded.split(":");
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch {
    return null;
  }
}

export async function getTokens(): Promise<NetDocTokens | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(ND_COOKIE_NAME);
  if (!cookie) return null;
  return decryptTokens(cookie.value);
}

export async function setTokensCookie(tokens: NetDocTokens): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ND_COOKIE_NAME, encryptTokens(tokens), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ND_COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function clearTokensCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ND_COOKIE_NAME);
}

export async function refreshTokenIfNeeded(tokens: NetDocTokens): Promise<NetDocTokens> {
  if (tokens.expires_at - Date.now() > ND_TOKEN_REFRESH_BUFFER) {
    return tokens;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
  });

  const basicAuth = Buffer.from(`${ND_CLIENT_ID}:${ND_CLIENT_SECRET}`).toString("base64");

  const res = await fetch(ND_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error("Failed to refresh NetDocuments token");
  }

  const data = await res.json();
  const refreshed: NetDocTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  await setTokensCookie(refreshed);
  return refreshed;
}

export async function getValidTokens(): Promise<NetDocTokens | null> {
  const tokens = await getTokens();
  if (!tokens) return null;

  try {
    return await refreshTokenIfNeeded(tokens);
  } catch {
    await clearTokensCookie();
    return null;
  }
}
