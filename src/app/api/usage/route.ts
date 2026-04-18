import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUsageByUser, getUsageByClient, getUsageByMatter, getAuditLogsFiltered, getAuditLogsFilteredCount } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const groupBy = searchParams.get("groupBy") ?? "user";

  if (groupBy === "log") {
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
    const limit = 100;
    const offset = page * limit;
    const [rows, total] = await Promise.all([
      getAuditLogsFiltered({ from, to, limit, offset, excludeAuthActions: true, billableOnly: true }),
      getAuditLogsFilteredCount({ from, to, excludeAuthActions: true, billableOnly: true }),
    ]);
    return NextResponse.json({ rows, total, page, limit });
  }

  let rows;
  if (groupBy === "client") {
    rows = await getUsageByClient();
  } else if (groupBy === "matter") {
    rows = await getUsageByMatter();
  } else {
    rows = await getUsageByUser();
  }

  return NextResponse.json({ rows });
}
