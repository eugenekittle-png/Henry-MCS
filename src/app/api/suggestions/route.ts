import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getSuggestions, createSuggestion } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const suggestions = await getSuggestions(session.userId);
  return NextResponse.json({ suggestions });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, description, isAnonymous } = body;

  if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!description?.trim()) return NextResponse.json({ error: "Description is required" }, { status: 400 });

  const id = await createSuggestion(session.userId, session.username, title.trim(), description.trim(), !!isAnonymous);
  return NextResponse.json({ id }, { status: 201 });
}
