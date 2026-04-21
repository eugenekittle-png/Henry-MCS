import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getGroups, createGroup } from "@/lib/db";

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
  const { name, pageKeys } = (await req.json()) as { name: string; pageKeys: string[] };
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const group = await createGroup(name.trim(), pageKeys ?? []);
  return NextResponse.json(group, { status: 201 });
}
