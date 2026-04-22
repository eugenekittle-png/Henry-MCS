import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, hasPage } from "@/lib/auth";
import { getMatrixTemplate, deleteWordTemplateFile } from "@/lib/db";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasPage(session, "matrix")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, fileId } = await params;
  const template = await getMatrixTemplate(Number(id), session.userId);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteWordTemplateFile(Number(fileId), Number(id));
  return NextResponse.json({ ok: true });
}
