import { NextRequest } from "next/server";
import { diffLines } from "diff";
import { parseFile } from "@/lib/parsers";
import { MAX_FILE_SIZE, COMPARE_EXTENSIONS } from "@/lib/constants";
import { getClient, getMatter } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAction, getClientIp } from "@/lib/audit";

export interface DiffLine {
  type: "added" | "removed" | "unchanged";
  value: string;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const ip = getClientIp(req);

  try {
    const formData = await req.formData();
    const file1 = formData.get("file1") as File | null;
    const file2 = formData.get("file2") as File | null;

    if (!file1 || !file2) {
      return Response.json({ error: "Two files are required" }, { status: 400 });
    }

    for (const file of [file1, file2]) {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!COMPARE_EXTENSIONS.includes(ext)) {
        return Response.json(
          { error: `Unsupported file type: ${file.name}. Only PDF, DOC, and DOCX are supported.` },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return Response.json(
          { error: `File too large: ${file.name} (max 10MB)` },
          { status: 400 }
        );
      }
    }

    const buffer1 = Buffer.from(await file1.arrayBuffer());
    const text1 = await parseFile(buffer1, file1.name);

    const buffer2 = Buffer.from(await file2.arrayBuffer());
    const text2 = await parseFile(buffer2, file2.name);

    const changes = diffLines(text1, text2);

    const lines: DiffLine[] = [];
    for (const change of changes) {
      const changeLines = change.value.split("\n");
      if (changeLines[changeLines.length - 1] === "") {
        changeLines.pop();
      }
      const type = change.added ? "added" : change.removed ? "removed" : "unchanged";
      for (const line of changeLines) {
        lines.push({ type, value: line });
      }
    }

    const added = lines.filter(l => l.type === "added").length;
    const removed = lines.filter(l => l.type === "removed").length;

    const details: Record<string, unknown> = { file1: file1.name, file2: file2.name, linesAdded: added, linesRemoved: removed };
    let clientNumber: string | null = null;
    let matterNumber: string | null = null;
    const clientId = formData.get("clientId");
    const matterId = formData.get("matterId");
    if (clientId && matterId) {
      const client = await getClient(parseInt(clientId as string, 10));
      const matter = await getMatter(parseInt(matterId as string, 10));
      if (client && matter) {
        clientNumber = client.client_number;
        matterNumber = matter.matter_number;
      }
    }

    await logAction({ username: session?.email ?? null, action: "Compare-Diff", clientNumber, matterNumber, details, success: true, ipAddress: ip });

    return Response.json({ file1Name: file1.name, file2Name: file2.name, lines });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    await logAction({ username: session?.email ?? null, action: "Compare-Diff", details: { error: message }, success: false, ipAddress: ip });
    return Response.json({ error: message }, { status: 500 });
  }
}
