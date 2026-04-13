import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getMattersForClient, searchMatters, dbCreateMatter, getClient } from "@/lib/db";
import { logAction, getClientIp } from "@/lib/audit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (isNaN(clientId)) {
    return Response.json({ error: "Invalid client ID" }, { status: 400 });
  }

  const search = req.nextUrl.searchParams.get("search") ?? "";
  if (search.length >= 1) {
    const matters = await searchMatters(clientId, search);
    return Response.json(matters);
  }

  const matters = await getMattersForClient(clientId);
  return Response.json(matters);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const ip = getClientIp(req);

  try {
    const { id } = await params;
    const clientId = parseInt(id, 10);
    if (isNaN(clientId)) {
      return Response.json({ error: "Invalid client ID" }, { status: 400 });
    }

    const client = await getClient(clientId);
    if (!client) {
      return Response.json({ error: "Client not found" }, { status: 404 });
    }

    const { matter_number, description } = await req.json();
    if (!matter_number || !description) {
      return Response.json({ error: "Matter number and description are required" }, { status: 400 });
    }

    const matter = await dbCreateMatter(clientId, matter_number, description);
    await logAction({
      username: session.email,
      action: "Matter-Create",
      clientNumber: client.client_number,
      matterNumber: matter_number,
      details: { clientName: client.name, description },
      success: true,
      ipAddress: ip,
    });
    return Response.json(matter, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create matter";
    await logAction({ username: session.email, action: "Matter-Create", details: { error: message }, success: false, ipAddress: ip });
    const status = message.includes("UNIQUE") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
