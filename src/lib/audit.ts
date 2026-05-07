import { insertAuditLog } from "@/lib/db";
import { NextRequest } from "next/server";

export function getClientIp(request: NextRequest): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    undefined
  );
}

export async function logAction(params: {
  username: string | null;
  action: string;
  clientNumber?: string | null;
  matterNumber?: string | null;
  details?: Record<string, unknown>;
  tokensInput?: number;
  tokensOutput?: number;
  success: boolean;
  ipAddress?: string | null;
}) {
  try {
    await insertAuditLog(params);
  } catch (err) {
    console.error("[audit] insertAuditLog failed:", err);
  }
}
