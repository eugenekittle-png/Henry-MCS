import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUsageForUser, getUsageForUserByClient, getUsageForUserByMatter, getAuditLogsFiltered, getAuditLogsFilteredCount, getTokensUsedByDay } from "@/lib/db";
import { checkAiRateLimit } from "@/lib/rateLimit";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const groupBy = searchParams.get("groupBy") ?? "action";
  const billableOnly = true;

  const userEmail = session.email;

  if (groupBy === "ratelimit") {
    const result = await checkAiRateLimit(session);
    return NextResponse.json(result);
  }

  if (groupBy === "daily") {
    const rows = await getTokensUsedByDay(userEmail, 7);
    return NextResponse.json({ rows });
  }

  if (groupBy === "log") {
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
    const limit = 100;
    const offset = page * limit;
    const [rows, total] = await Promise.all([
      getAuditLogsFiltered({ username: userEmail, from, to, limit, offset, billableOnly }),
      getAuditLogsFilteredCount({ username: userEmail, from, to, billableOnly }),
    ]);
    return NextResponse.json({ username: userEmail, rows, total, page, limit });
  }

  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  let rows;
  if (groupBy === "client") {
    rows = await getUsageForUserByClient(userEmail, from, to, billableOnly);
  } else if (groupBy === "matter") {
    rows = await getUsageForUserByMatter(userEmail, from, to, billableOnly);
  } else {
    rows = await getUsageForUser(userEmail, from, to, billableOnly);
  }

  return NextResponse.json({ username: userEmail, rows });
}
