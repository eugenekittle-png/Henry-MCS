import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPlaybookItems, createPlaybookItem } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  const items = await getPlaybookItems(parseInt(id, 10));
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  const { check_name, instruction, order_num } = await req.json();
  if (!check_name?.trim() || !instruction?.trim()) return NextResponse.json({ error: "check_name and instruction are required" }, { status: 400 });
  await createPlaybookItem(parseInt(id, 10), check_name.trim(), instruction.trim(), order_num ?? 0);
  return NextResponse.json({ ok: true });
}
