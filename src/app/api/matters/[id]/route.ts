import { NextRequest } from "next/server";
import { getMatter, updateMatter, deleteMatter } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const matterId = parseInt(id, 10);
    if (isNaN(matterId)) {
      return Response.json({ error: "Invalid matter ID" }, { status: 400 });
    }

    const existing = await getMatter(matterId);
    if (!existing) {
      return Response.json({ error: "Matter not found" }, { status: 404 });
    }

    const { matter_number, description } = await req.json();
    if (!matter_number || !description) {
      return Response.json({ error: "Matter number and description are required" }, { status: 400 });
    }

    const updated = await updateMatter(matterId, matter_number, description);
    return Response.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update matter";
    const status = message.includes("UNIQUE") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const matterId = parseInt(id, 10);
  if (isNaN(matterId)) {
    return Response.json({ error: "Invalid matter ID" }, { status: 400 });
  }

  const existing = await getMatter(matterId);
  if (!existing) {
    return Response.json({ error: "Matter not found" }, { status: 404 });
  }

  await deleteMatter(matterId);
  return Response.json({ success: true });
}
