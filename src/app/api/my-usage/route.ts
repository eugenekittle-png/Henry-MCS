import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUsageForUser, getUsageForUserByClient, getUsageForUserByMatter, getAuditLogsFiltered, getAuditLogsFilteredCount } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const billableOnly = session.role !== "admin";
  const { searchParams } = request.nextUrl;
  const groupBy = searchParams.get("groupBy") ?? "action";

  if (groupBy === "log") {
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
    const limit = 100;
    const offset = page * limit;
    const [rows, total] = await Promise.all([
      getAuditLogsFiltered({ username: session.username, from, to, limit, offset, billableOnly }),
      getAuditLogsFilteredCount({ username: session.username, from, to, billableOnly }),
    ]);
    return NextResponse.json({ username: session.username, rows, total, page, limit });
  }

  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  let rows;
  if (groupBy === "client") {
    rows = await getUsageForUserByClient(session.username, from, to, billableOnly);
  } else if (groupBy === "matter") {
    rows = await getUsageForUserByMatter(session.username, from, to, billableOnly);
  } else {
    rows = await getUsageForUser(session.username, from, to, billableOnly);
  }

  return NextResponse.json({ username: session.username, rows });
}
