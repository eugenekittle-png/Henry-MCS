import { del } from "@vercel/blob";
import { getSession } from "@/lib/auth";

export async function POST(request: Request): Promise<Response> {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 403 });

  const { url } = await request.json();
  if (!url || !url.includes("blob.vercel-storage.com")) {
    return Response.json({ error: "Invalid blob URL" }, { status: 400 });
  }

  await del(url);
  return Response.json({ ok: true });
}
