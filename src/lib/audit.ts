import { insertAuditLog } from "@/lib/db";

export async function logAction(params: {
  username: string | null;
  action: string;
  clientNumber?: string | null;
  matterNumber?: string | null;
  details?: Record<string, unknown>;
  tokensInput?: number;
  tokensOutput?: number;
  success: boolean;
}) {
  try {
    await insertAuditLog(params);
  } catch {
    // Never let audit logging break the main flow
  }
}
