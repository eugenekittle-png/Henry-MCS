import { NextRequest } from "next/server";
import { getClient, updateClient, deleteClient } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientId = parseInt(id, 10);
    if (isNaN(clientId)) {
      return Response.json({ error: "Invalid client ID" }, { status: 400 });
    }

    const existing = getClient(clientId);
    if (!existing) {
      return Response.json({ error: "Client not found" }, { status: 404 });
    }

    const { client_number, name } = await req.json();
    if (!client_number || !name) {
      return Response.json({ error: "Client number and name are required" }, { status: 400 });
    }

    const updated = updateClient(clientId, client_number, name);
    return Response.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update client";
    const status = message.includes("UNIQUE") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (isNaN(clientId)) {
    return Response.json({ error: "Invalid client ID" }, { status: 400 });
  }

  const existing = getClient(clientId);
  if (!existing) {
    return Response.json({ error: "Client not found" }, { status: 404 });
  }

  deleteClient(clientId);
  return Response.json({ success: true });
}
