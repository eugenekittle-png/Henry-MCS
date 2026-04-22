import { getTokensUsedIn6Hours, getOldestTokenLogIn6Hours, getSetting, getUser } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";

export interface RateLimitResult {
  allowed: boolean;
  used: number;
  limit: number; // 0 = unlimited
  approaching: boolean; // true when >= 90% of limit used
  resetsAt: string | null; // ISO string — only set when limit is reached
}

export async function checkAiRateLimit(session: SessionPayload): Promise<RateLimitResult> {
  // Admins bypass the rate limit entirely
  if (session.role === "admin") {
    return { allowed: true, used: 0, limit: 0, approaching: false, resetsAt: null };
  }

  const [used, globalLimitStr, user] = await Promise.all([
    getTokensUsedIn6Hours(session.email),
    getSetting("ai_token_limit_per_6h"),
    getUser(session.userId),
  ]);

  const globalLimit = parseInt(globalLimitStr ?? "1000000", 10);
  const limit = user?.ai_token_limit ?? globalLimit;

  // 0 means unlimited for this specific user
  if (limit === 0) {
    return { allowed: true, used, limit: 0, approaching: false, resetsAt: null };
  }

  const pct = used / limit;
  const approaching = pct >= 0.9 && pct < 1;

  if (used < limit) {
    return { allowed: true, used, limit, approaching, resetsAt: null };
  }

  // Limit reached — calculate when the window resets based on the oldest log entry
  const oldest = await getOldestTokenLogIn6Hours(session.email);
  let resetsAt: string | null = null;
  if (oldest) {
    const oldestDate = new Date(oldest + "Z");
    resetsAt = new Date(oldestDate.getTime() + 6 * 60 * 60 * 1000).toISOString();
  }

  return { allowed: false, used, limit, approaching: false, resetsAt };
}
