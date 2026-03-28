import { NextRequest } from "next/server";
import { getClient, updateClient, deleteClient } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAction, getClientIp } from "@/lib/audit";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }
  const ip = getClientIp(req);
  try {
    const { id } = await params;
    const clientId = parseInt(id, 10);
    if (isNaN(clientId)) return Response.json({ error: "Invalid client ID" }, { status: 400 });

    const existing = await getClient(clientId);
    if (!existing) return Response.json({ error: "Client not found" }, { status: 404 });

    const { client_number, name } = await req.json();
    if (!client_number || !name) return Response.json({ error: "Client number and name are required" }, { status: 400 });

    const updated = await updateClient(clientId, client_number, name);
    await logAction({ username: session?.username ?? null, action: "Client-Update", details: { clientId, clientNumber: client_number, name }, success: true, ipAddress: ip });
    return Response.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update client";
    const status = message.includes("UNIQUE") ? 409 : 500;
    await logAction({ username: session?.username ?? null, action: "Client-Update", details: { error: message }, success: false, ipAddress: ip });
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }
  const ip = getClientIp(req);
  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (isNaN(clientId)) return Response.json({ error: "Invalid client ID" }, { status: 400 });

  const existing = await getClient(clientId);
  if (!existing) return Response.json({ error: "Client not found" }, { status: 404 });

  await deleteClient(clientId);
  await logAction({ username: session?.username ?? null, action: "Client-Delete", details: { clientId, clientNumber: existing.client_number, name: existing.name }, success: true, ipAddress: ip });
  return Response.json({ success: true });
}
