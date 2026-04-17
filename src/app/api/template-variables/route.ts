import { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getTemplateVariables, upsertTemplateVariables, updateTemplateVariable } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientNumber = searchParams.get("clientNumber") ?? "";
  const matterNumber = searchParams.get("matterNumber") ?? "";

  const variables = await getTemplateVariables(session.email, clientNumber, matterNumber);
  return Response.json(variables);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { variables, clientNumber, matterNumber } = await req.json();
  if (!Array.isArray(variables) || variables.length === 0) {
    return Response.json({ error: "variables array required" }, { status: 400 });
  }

  await upsertTemplateVariables(variables, session.email, clientNumber ?? "", matterNumber ?? "");
  return Response.json({ ok: true, count: variables.length });
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id, format } = await req.json();
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  await updateTemplateVariable(Number(id), session.email, { format: format ?? null });
  return Response.json({ ok: true });
}
