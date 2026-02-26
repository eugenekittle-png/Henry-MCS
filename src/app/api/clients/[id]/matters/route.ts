import { NextRequest } from "next/server";
import { getMattersForClient } from "@/lib/db";

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
