import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getMatrixTemplate, updateMatrixTemplateColumn, deleteMatrixTemplateColumn, reorderMatrixTemplateColumns, getMatrixTemplateColumns } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; colId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, colId } = await params;
  const template = await getMatrixTemplate(Number(id), session.userId);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  // Reorder: body contains { orderedIds: number[] }
  if (body.orderedIds) {
    await reorderMatrixTemplateColumns(Number(id), body.orderedIds);
    return NextResponse.json({ ok: true });
  }

  // Update column name/instruction
  const { column_name, instruction } = body;
  if (!column_name?.trim()) return NextResponse.json({ error: "Column name is required" }, { status: 400 });

  await updateMatrixTemplateColumn(Number(colId), Number(id), column_name.trim(), instruction?.trim() ?? "");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; colId: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, colId } = await params;
  const template = await getMatrixTemplate(Number(id), session.userId);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteMatrixTemplateColumn(Number(colId), Number(id));

  // Re-normalise order_num after deletion
  const remaining = await getMatrixTemplateColumns(Number(id));
  if (remaining.length > 0) {
    await reorderMatrixTemplateColumns(Number(id), remaining.map((c) => c.id));
  }

  return NextResponse.json({ ok: true });
}
