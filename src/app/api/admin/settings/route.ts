import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/db";
import { logAction, getClientIp } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const require2fa = await getSetting("require_2fa");
  return NextResponse.json({ require2fa: require2fa === "1" });
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { require2fa } = await req.json();
  await setSetting("require_2fa", require2fa ? "1" : "0");
  await logAction({ username: session.email, action: "Settings-Update", details: { require2fa }, success: true, ipAddress: getClientIp(req) });
  return NextResponse.json({ ok: true });
}
