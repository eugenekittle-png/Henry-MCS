import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updatePlaybookItem, deletePlaybookItem } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { itemId } = await params;
  const { check_name, instruction, order_num } = await req.json();
  if (!check_name?.trim() || !instruction?.trim()) return NextResponse.json({ error: "check_name and instruction are required" }, { status: 400 });
  await updatePlaybookItem(parseInt(itemId, 10), check_name.trim(), instruction.trim(), order_num ?? 0);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { itemId } = await params;
  await deletePlaybookItem(parseInt(itemId, 10));
  return NextResponse.json({ ok: true });
}
