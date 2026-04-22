import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, hasPage } from "@/lib/auth";
import { getMatrixTemplate, getMatrixTemplateColumns, addMatrixTemplateColumn } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasPage(session, "matrix")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const template = await getMatrixTemplate(Number(id), session.userId);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const columns = await getMatrixTemplateColumns(Number(id));
  return NextResponse.json({ columns });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasPage(session, "matrix")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const template = await getMatrixTemplate(Number(id), session.userId);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { column_name, instruction } = await req.json();
  if (!column_name?.trim()) return NextResponse.json({ error: "Column name is required" }, { status: 400 });

  const column = await addMatrixTemplateColumn(Number(id), column_name.trim(), instruction?.trim() ?? "");
  return NextResponse.json({ column }, { status: 201 });
}
