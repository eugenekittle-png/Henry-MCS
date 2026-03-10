import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPlaybook, getPlaybookItems, updatePlaybook, deletePlaybook } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  const [playbook, items] = await Promise.all([getPlaybook(parseInt(id, 10)), getPlaybookItems(parseInt(id, 10))]);
  if (!playbook) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ playbook, items });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  await updatePlaybook(parseInt(id, 10), name.trim(), description?.trim() ?? "");
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  await deletePlaybook(parseInt(id, 10));
  return NextResponse.json({ ok: true });
}
