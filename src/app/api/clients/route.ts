import { getClients } from "@/lib/db";

export async function GET() {
  const clients = getClients();
  return Response.json(clients);
}
