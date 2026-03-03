import { getAllMatters } from "@/lib/db";

export async function GET() {
  const matters = getAllMatters();
  return Response.json(matters);
}
