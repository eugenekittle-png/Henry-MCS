import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { fetchCourtListenerText } from "@/lib/courtlistener";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const clusterId = req.nextUrl.searchParams.get("clusterId");
  if (!clusterId) return Response.json({ error: "clusterId is required" }, { status: 400 });

  const text = await fetchCourtListenerText(clusterId);
  if (!text) return Response.json({ error: "Opinion text is not available for this case" }, { status: 404 });
  return Response.json({ text });
}
