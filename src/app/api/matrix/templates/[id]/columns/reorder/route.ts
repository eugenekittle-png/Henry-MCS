import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getMatrixTemplate, reorderMatrixTemplateColumns } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const template = await getMatrixTemplate(Number(id), session.userId);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { orderedIds } = await req.json();
  if (!Array.isArray(orderedIds)) return NextResponse.json({ error: "orderedIds must be an array" }, { status: 400 });

  await reorderMatrixTemplateColumns(Number(id), orderedIds);
  return NextResponse.json({ ok: true });
}
