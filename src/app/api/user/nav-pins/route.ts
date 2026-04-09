import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getUserNavPins, setUserNavPins } from "@/lib/db";

const VALID_TOOLS = ["assist", "breakdown", "compare", "matrix"];
const MAX_PINS = 6;

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pins = await getUserNavPins(session.userId);
  return NextResponse.json({ pins });
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pins } = await req.json();
  if (!Array.isArray(pins)) return NextResponse.json({ error: "pins must be an array" }, { status: 400 });
  if (pins.length > MAX_PINS) return NextResponse.json({ error: `Max ${MAX_PINS} pins allowed` }, { status: 400 });

  const validPins = pins.filter((p: unknown) => typeof p === "string" && VALID_TOOLS.includes(p));
  await setUserNavPins(session.userId, validPins);
  return NextResponse.json({ pins: validPins });
}
