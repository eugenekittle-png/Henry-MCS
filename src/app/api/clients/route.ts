import { NextRequest } from "next/server";
import { getClients, searchClients, dbCreateClient } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAction, getClientIp } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "0", 10) || undefined;
  if (search.length >= 1) {
    const clients = await searchClients(search);
    return Response.json(limit ? clients.slice(0, limit) : clients);
  }
  const clients = await getClients();
  return Response.json(limit ? clients.slice(0, limit) : clients);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }
  const ip = getClientIp(req);
  try {
    const { client_number, name } = await req.json();
    if (!client_number || !name) {
      return Response.json({ error: "Client number and name are required" }, { status: 400 });
    }
    const client = await dbCreateClient(client_number, name);
    await logAction({ username: session?.email ?? null, action: "Client-Create", details: { clientNumber: client_number, name }, success: true, ipAddress: ip });
    return Response.json(client, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create client";
    const status = message.includes("UNIQUE") ? 409 : 500;
    await logAction({ username: session?.email ?? null, action: "Client-Create", details: { error: message }, success: false, ipAddress: ip });
    return Response.json({ error: message }, { status });
  }
}
