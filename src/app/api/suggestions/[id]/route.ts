import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { updateSuggestionStatus, deleteSuggestion, SuggestionStatus } from "@/lib/db";

const VALID_STATUSES: SuggestionStatus[] = ["Submitted", "Reviewed", "Developing", "Staging", "Production"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const { status, comment } = body;

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  await updateSuggestionStatus(Number(id), status, session.username, comment);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await deleteSuggestion(Number(id));
  return NextResponse.json({ ok: true });
}
