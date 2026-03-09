import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUsageByUser, getUsageByClient, getUsageByMatter } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const groupBy = request.nextUrl.searchParams.get("groupBy") ?? "user";

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
