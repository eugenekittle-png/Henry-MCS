import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { getSessionFromRequest, hasPage } from "@/lib/auth";
import { getMatrixTemplate, getWordTemplateFiles, getWordTemplateFile } from "@/lib/db";
import { fillDocx, mapColumnsToTags } from "@/lib/docx-fill";

export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasPage(session, "matrix")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const template = await getMatrixTemplate(Number(id), session.userId);
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { values, fileIds } = (await req.json()) as {
    values: Record<string, string>;
    fileIds?: number[];
  };

  if (!values || typeof values !== "object") {
    return NextResponse.json({ error: "values are required" }, { status: 400 });
  }

  // Load the requested files (or all files for this template)
  let files;
  if (fileIds && fileIds.length > 0) {
    const loaded = await Promise.all(
      fileIds.map((fid) => getWordTemplateFile(fid, Number(id)))
    );
    files = loaded.filter(Boolean) as NonNullable<typeof loaded[number]>[];
  } else {
    const allFiles = await getWordTemplateFiles(Number(id));
    if (allFiles.length === 0) return NextResponse.json({ error: "No Word templates uploaded" }, { status: 400 });
    // Load full content for each
    const loaded = await Promise.all(
      allFiles.map((f) => getWordTemplateFile(f.id, Number(id)))
    );
    files = loaded.filter(Boolean) as NonNullable<typeof loaded[number]>[];
  }

  if (files.length === 0) return NextResponse.json({ error: "No matching files found" }, { status: 400 });

  // Fill each file
  const filled: { name: string; data: Uint8Array }[] = [];
  for (const file of files) {
    let tagNames: string[] = [];
    try {
      tagNames = JSON.parse(file.variable_names);
    } catch {
      tagNames = [];
    }

    const tagValues = mapColumnsToTags(values, tagNames);
    const data = await fillDocx(file.content, tagValues);
    filled.push({ name: file.name, data });
  }

  // Single file: return .docx directly
  if (filled.length === 1) {
    const { name, data } = filled[0];
    return new NextResponse(Buffer.from(data), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`,
      },
    });
  }

  // Multiple files: return ZIP
  const zip = new JSZip();
  const usedNames = new Map<string, number>();
  for (const { name, data } of filled) {
    // Avoid duplicate filenames in the zip
    const count = usedNames.get(name) ?? 0;
    usedNames.set(name, count + 1);
    const finalName = count === 0 ? name : name.replace(/\.docx$/i, `_${count}.docx`);
    zip.file(finalName, data);
  }

  const zipBuffer = await zip.generateAsync({ type: "uint8array" });
  const templateSlug = template.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();

  return new NextResponse(Buffer.from(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="filled-${templateSlug}.zip"`,
    },
  });
}
