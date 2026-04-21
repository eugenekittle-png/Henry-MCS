import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getGroups, createGroup } from "@/lib/db";
import { logAction, getClientIp } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const groups = await getGroups();
  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const ip = getClientIp(req);
  const { name, pageKeys } = (await req.json()) as { name: string; pageKeys: string[] };
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const group = await createGroup(name.trim(), pageKeys ?? []);
  await logAction({ username: session.email, action: "Group-Create", details: { name: name.trim(), pages: pageKeys ?? [] }, success: true, ipAddress: ip });
  return NextResponse.json(group, { status: 201 });
}
