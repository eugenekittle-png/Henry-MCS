import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getSuggestions, createSuggestion, getUserVotesUsed, SUGGESTION_VOTE_LIMIT } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [suggestions, userVotesUsed] = await Promise.all([
    getSuggestions(session.userId),
    getUserVotesUsed(session.userId),
  ]);
  return NextResponse.json({ suggestions, userVotesUsed, voteLimit: SUGGESTION_VOTE_LIMIT });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, description, isAnonymous } = body;

  if (!title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!description?.trim()) return NextResponse.json({ error: "Description is required" }, { status: 400 });

  const id = await createSuggestion(session.userId, session.email, title.trim(), description.trim(), !!isAnonymous);
  return NextResponse.json({ id }, { status: 201 });
}
