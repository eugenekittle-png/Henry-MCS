import { NextRequest, NextResponse } from "next/server";
import { getSession, hasPage } from "@/lib/auth";
import { getAuditLogs, getAuditLogCount } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || !hasPage(session, "audit")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 500);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const [logs, total] = await Promise.all([getAuditLogs(limit, offset), getAuditLogCount()]);
  return NextResponse.json({ logs, total });
}
