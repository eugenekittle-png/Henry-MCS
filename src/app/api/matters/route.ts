import { getAllMatters } from "@/lib/db";

export async function GET() {
  const matters = await getAllMatters();
  return Response.json(matters);
}
