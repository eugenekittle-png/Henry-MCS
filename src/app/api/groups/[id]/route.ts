import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getGroup, getGroupPages, updateGroup, deleteGroup } from "@/lib/db";

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
  const { id } = await params;
  const group = await getGroup(Number(id));
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, pageKeys } = (await req.json()) as { name: string; pageKeys: string[] };
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  await updateGroup(Number(id), name.trim(), pageKeys ?? []);
  const updated = await getGroup(Number(id));
  const updatedPageKeys = await getGroupPages(Number(id));
  return NextResponse.json({ ...updated, pageKeys: updatedPageKeys });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;
  const group = await getGroup(Number(id));
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (group.is_default) {
    return NextResponse.json({ error: "Cannot delete the default group" }, { status: 400 });
  }
  await deleteGroup(Number(id));
  return NextResponse.json({ ok: true });
}
