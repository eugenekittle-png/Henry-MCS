import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getMatrixTemplates, createMatrixTemplate } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientNumber = searchParams.get("clientNumber") ?? undefined;
  const matterNumber = searchParams.get("matterNumber") ?? undefined;

  const templates = await getMatrixTemplates(session.userId, clientNumber, matterNumber);
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, clientId, matterId, clientNumber, matterNumber } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!clientId || !matterId) return NextResponse.json({ error: "Client and matter are required" }, { status: 400 });

  const id = await createMatrixTemplate(
    session.userId, name.trim(), description?.trim() ?? "",
    clientId, matterId, clientNumber, matterNumber
  );
  return NextResponse.json({ id }, { status: 201 });
}
