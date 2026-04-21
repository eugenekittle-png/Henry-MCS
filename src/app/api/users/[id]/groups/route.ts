import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUser, getUserGroups } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;
  const user = await getUser(Number(id));
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const groups = await getUserGroups(Number(id));
  return NextResponse.json({ groups });
}
