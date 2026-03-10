import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPlaybooks, createPlaybook } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const playbooks = await getPlaybooks();
  return NextResponse.json({ playbooks });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const playbook = await createPlaybook(name.trim(), description?.trim() ?? "");
  return NextResponse.json({ playbook });
}
