import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, hasPage } from "@/lib/auth";
import { getMatrixTemplate, copyMatrixTemplate } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasPage(session, "matrix")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const template = await getMatrixTemplate(Number(id), session.userId);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, clientId, matterId, clientNumber, matterNumber } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!clientId || !matterId) return NextResponse.json({ error: "Client and matter are required" }, { status: 400 });

  const newId = await copyMatrixTemplate(
    Number(id), session.userId,
    name.trim(),
    clientId, matterId, clientNumber, matterNumber
  );
  return NextResponse.json({ id: newId }, { status: 201 });
}
