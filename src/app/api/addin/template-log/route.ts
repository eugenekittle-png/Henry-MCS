import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { logAction, getClientIp } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { action, variables, clientNumber, matterNumber } = await req.json();
    const ip = getClientIp(req);

    await logAction({
      username: session.email,
      action,
      clientNumber: clientNumber || null,
      matterNumber: matterNumber || null,
      details: { variables, source: "word-addin-template" },
      success: true,
      ipAddress: ip,
    });

    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false });
  }
}
