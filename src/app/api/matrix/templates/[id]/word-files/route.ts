import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, hasPage } from "@/lib/auth";
import { getMatrixTemplate, getWordTemplateFiles, addWordTemplateFile } from "@/lib/db";
import { extractDocxVariableNames } from "@/lib/docx-fill";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasPage(session, "matrix")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const template = await getMatrixTemplate(Number(id), session.userId);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const files = await getWordTemplateFiles(Number(id));
  return NextResponse.json({ files });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasPage(session, "matrix")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const template = await getMatrixTemplate(Number(id), session.userId);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json({ error: "Only .docx files are supported" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  let variableNames: string[] = [];
  try {
    variableNames = await extractDocxVariableNames(base64);
  } catch {
    // Proceed with empty variable list if extraction fails
  }

  const fileId = await addWordTemplateFile(Number(id), file.name, base64, variableNames, file.size);

  return NextResponse.json({ id: fileId, name: file.name, variable_names: JSON.stringify(variableNames), file_size: file.size });
}
