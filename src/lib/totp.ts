import { TOTP, generateSecret as _generateSecret } from "otplib";
import { NobleCryptoPlugin } from "@otplib/plugin-crypto-noble";
import { ScureBase32Plugin } from "@otplib/plugin-base32-scure";

const cryptoPlugin = new NobleCryptoPlugin();
const base32Plugin = new ScureBase32Plugin();

const totpInstance = new TOTP({ crypto: cryptoPlugin, base32: base32Plugin });

export function generateSecret(): string {
  return _generateSecret();
}

export function generateKeyUri(username: string, secret: string): string {
  const t = new TOTP({ crypto: cryptoPlugin, base32: base32Plugin, issuer: "Henry MCS", label: username });
  return t.toURI({ secret });
}

export async function verifyToken(token: string, secret: string): Promise<boolean> {
  const result = await totpInstance.verify(token, { secret });
  return result.valid;
}
