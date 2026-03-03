import { NextRequest } from "next/server";
import { getClients, dbCreateClient } from "@/lib/db";

export async function GET() {
  const clients = await getClients();
  return Response.json(clients);
}

export async function POST(req: NextRequest) {
  try {
    const { client_number, name } = await req.json();
    if (!client_number || !name) {
      return Response.json({ error: "Client number and name are required" }, { status: 400 });
    }
    const client = await dbCreateClient(client_number, name);
    return Response.json(client, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create client";
    const status = message.includes("UNIQUE") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
