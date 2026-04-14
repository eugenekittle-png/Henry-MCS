/**
 * Azure Entra ID / federated SSO configuration.
 *
 * Nothing here activates until all three env vars are set:
 *   AZURE_CLIENT_ID     — from your App Registration in Entra ID
 *   AZURE_TENANT_ID     — your directory (tenant) ID
 *   AZURE_CLIENT_SECRET — a client secret from the App Registration
 *
 * When those are present, a "Sign in with Microsoft" button appears on the
 * login page and users can authenticate via Azure. Existing local-password
 * accounts are automatically linked on first Azure sign-in by matching email.
 */

export const AZURE_CONFIGURED =
  !!process.env.AZURE_CLIENT_ID &&
  !!process.env.AZURE_TENANT_ID &&
  !!process.env.AZURE_CLIENT_SECRET;

export const azureAuthConfig = AZURE_CONFIGURED
  ? {
      clientId: process.env.AZURE_CLIENT_ID!,
      tenantId: process.env.AZURE_TENANT_ID!,
      clientSecret: process.env.AZURE_CLIENT_SECRET!,
      // Authorization endpoint — single-tenant (only your org's accounts)
      authorizationUrl: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
      scope: "openid profile email",
    }
  : null;
