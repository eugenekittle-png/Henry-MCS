import NextAuth from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import { AZURE_CONFIGURED, azureAuthConfig } from "@/lib/azure-auth";
import { upsertAzureUser, getUserPages, getGroups, setUserGroups } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";
import { logAction } from "@/lib/audit";

// This route only does anything meaningful when Azure is configured.
// Without the env vars it returns 404 for all requests.

const handler = AZURE_CONFIGURED && azureAuthConfig
  ? NextAuth({
      providers: [
        AzureADProvider({
          clientId: azureAuthConfig.clientId,
          clientSecret: azureAuthConfig.clientSecret,
          tenantId: azureAuthConfig.tenantId,
        }),
      ],
      callbacks: {
        async signIn({ account, profile }) {
          if (account?.provider !== "azure-ad") return false;

          const azureId = account.providerAccountId;
          const email = profile?.email ?? (profile as Record<string, string>)?.preferred_username ?? "";
          const displayName = profile?.name ?? email;

          if (!azureId || !email) return false;

          try {
            const user = await upsertAzureUser(azureId, email, displayName);

            // Block disabled accounts
            if (user.locked_until) {
              const lockedUntil = new Date(user.locked_until + "Z");
              if (lockedUntil > new Date()) return false;
            }

            // Auto-assign new users to the default group
            if (user.isNew && user.role === "user") {
              const groups = await getGroups();
              const defaultGroup = groups.find(g => g.is_default);
              if (defaultGroup) await setUserGroups(user.id, [defaultGroup.id]);
            }

            // Issue the app's own session cookie so the rest of the app works normally
            const pages = await getUserPages(user.id);
            await setSessionCookie({ userId: user.id, username: user.username, email: user.email, role: user.role, mustChangePassword: false, pages });
            await logAction({ username: user.email, action: "Login", details: { provider: "azure" }, success: true });
            return true;
          } catch (err) {
            await logAction({ username: email, action: "Login", details: { provider: "azure", error: String(err) }, success: false });
            return false;
          }
        },
        // Redirect back to the app's home after sign-in
        async redirect() {
          return "/";
        },
      },
      pages: {
        signIn: "/login",
        error: "/login",
      },
    })
  : { GET: () => new Response("Azure SSO not configured", { status: 404 }), POST: () => new Response("Azure SSO not configured", { status: 404 }) };

export const GET = AZURE_CONFIGURED ? (handler as Awaited<ReturnType<typeof NextAuth>>).GET : () => new Response("Azure SSO not configured", { status: 404 });
export const POST = AZURE_CONFIGURED ? (handler as Awaited<ReturnType<typeof NextAuth>>).POST : () => new Response("Azure SSO not configured", { status: 404 });
