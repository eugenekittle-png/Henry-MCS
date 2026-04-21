import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getGroup, getGroupPages, updateGroup, deleteGroup } from "@/lib/db";
import { logAction, getClientIp } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;
  const group = await getGroup(Number(id));
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pageKeys = await getGroupPages(Number(id));
  return NextResponse.json({ ...group, pageKeys });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const ip = getClientIp(req);
  const { id } = await params;
  const group = await getGroup(Number(id));
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, pageKeys } = (await req.json()) as { name: string; pageKeys: string[] };
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  await updateGroup(Number(id), name.trim(), pageKeys ?? []);
  await logAction({ username: session.email, action: "Group-Update", details: { group: group.name, name: name.trim(), pages: pageKeys ?? [] }, success: true, ipAddress: ip });
  const updated = await getGroup(Number(id));
  const updatedPageKeys = await getGroupPages(Number(id));
  return NextResponse.json({ ...updated, pageKeys: updatedPageKeys });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const ip = getClientIp(req);
  const { id } = await params;
  const group = await getGroup(Number(id));
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (group.is_default) {
    return NextResponse.json({ error: "Cannot delete the default group" }, { status: 400 });
  }
  await deleteGroup(Number(id));
  await logAction({ username: session.email, action: "Group-Delete", details: { group: group.name }, success: true, ipAddress: ip });
  return NextResponse.json({ ok: true });
}
