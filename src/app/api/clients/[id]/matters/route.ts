import { NextRequest } from "next/server";
import { getMattersForClient, createMatter, getClient } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (isNaN(clientId)) {
    return Response.json({ error: "Invalid client ID" }, { status: 400 });
  }

  const matters = getMattersForClient(clientId);
  return Response.json(matters);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientId = parseInt(id, 10);
    if (isNaN(clientId)) {
      return Response.json({ error: "Invalid client ID" }, { status: 400 });
    }

    const client = getClient(clientId);
    if (!client) {
      return Response.json({ error: "Client not found" }, { status: 404 });
    }

    const { matter_number, description } = await req.json();
    if (!matter_number || !description) {
      return Response.json({ error: "Matter number and description are required" }, { status: 400 });
    }

    const matter = createMatter(clientId, matter_number, description);
    return Response.json(matter, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create matter";
    const status = message.includes("UNIQUE") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
