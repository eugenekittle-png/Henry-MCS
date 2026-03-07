export const ND_CLIENT_ID = process.env.DM_CLIENT_ID!;
export const ND_CLIENT_SECRET = process.env.DM_CLIENT_SECRET!;
export const ND_VAULT_URL = process.env.DM_VAULT_URL || "https://vault.netvoyage.com";

export const ND_AUTH_URL = `${ND_VAULT_URL}/neWeb2/OAuth.aspx`;
export const ND_TOKEN_URL = "https://api.vault.netvoyage.com/v1/OAuth";
export const ND_API_BASE = "https://api.vault.netvoyage.com/v1";

export const ND_COOKIE_NAME = "nd_tokens";
export const ND_STATE_COOKIE = "nd_oauth_state";
export const ND_RETURN_COOKIE = "nd_return_url";

export const ND_COOKIE_MAX_AGE = 90 * 24 * 60 * 60; // 90 days in seconds
export const ND_TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // 5 minutes in ms

export function getRedirectUri(): string {
  if (process.env.ND_REDIRECT_URI) return process.env.ND_REDIRECT_URI;
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost";
}
