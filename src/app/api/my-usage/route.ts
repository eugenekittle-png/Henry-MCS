import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUsageForUser, getUsageForUserByClient, getUsageForUserByMatter } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groupBy = request.nextUrl.searchParams.get("groupBy") ?? "action";

  let rows;
  if (groupBy === "client") {
    rows = await getUsageForUserByClient(session.username);
  } else if (groupBy === "matter") {
    rows = await getUsageForUserByMatter(session.username);
  } else {
    rows = await getUsageForUser(session.username);
  }

  return NextResponse.json({ username: session.username, rows });
}
