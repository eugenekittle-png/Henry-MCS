import { NextRequest } from "next/server";
import { getMatter, updateMatter, deleteMatter } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const matterId = parseInt(id, 10);
    if (isNaN(matterId)) return Response.json({ error: "Invalid matter ID" }, { status: 400 });

    const existing = await getMatter(matterId);
    if (!existing) return Response.json({ error: "Matter not found" }, { status: 404 });

    const { matter_number, description } = await req.json();
    if (!matter_number || !description) return Response.json({ error: "Matter number and description are required" }, { status: 400 });

    const updated = await updateMatter(matterId, matter_number, description);
    await logAction({ username: session?.username ?? null, action: "Matter-Update", details: { matterId, matterNumber: matter_number, description }, success: true });
    return Response.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update matter";
    const status = message.includes("UNIQUE") ? 409 : 500;
    await logAction({ username: session?.username ?? null, action: "Matter-Update", details: { error: message }, success: false });
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;
  const matterId = parseInt(id, 10);
  if (isNaN(matterId)) return Response.json({ error: "Invalid matter ID" }, { status: 400 });

  const existing = await getMatter(matterId);
  if (!existing) return Response.json({ error: "Matter not found" }, { status: 404 });

  await deleteMatter(matterId);
  await logAction({ username: session?.username ?? null, action: "Matter-Delete", details: { matterId, matterNumber: existing.matter_number, description: existing.description }, success: true });
  return Response.json({ success: true });
}
