import { NextRequest } from "next/server";
import { getSessionFromRequest, hasPage } from "@/lib/auth";
import { getMatrixTemplate, getMatrixTemplateColumns } from "@/lib/db";
import { parseFile } from "@/lib/parsers";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 300;

const client = new Anthropic();

function emit(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

async function extractFromText(
  text: string,
  columns: { column_name: string; instruction: string | null }[]
): Promise<Record<string, string | null>> {
  const columnList = columns
    .map((c) => `- "${c.column_name}"${c.instruction ? `: ${c.instruction}` : ""}`)
    .join("\n");

  const excerpt = text.slice(0, 10000);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: `You are extracting structured data from a legal document to populate a comparison matrix.
Extract the following fields. Return ONLY a valid JSON object where keys are exactly the column names and values are extracted strings (or null if not found). Keep values concise but complete.

Columns:
${columnList}`,
    messages: [
      { role: "user", content: `Extract the requested fields from this document:\n\n${excerpt}` },
    ],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "{}";
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return Object.fromEntries(columns.map((c) => [c.column_name, null]));
  }
}

async function buildConsensus(
  rows: { filename: string; values: Record<string, string | null> }[],
  columns: { column_name: string; instruction: string | null }[]
): Promise<Record<string, string | null>> {
  if (rows.length === 0) return {};
  if (rows.length === 1) return { ...rows[0].values };

  const columnNames = columns.map((c) => c.column_name);
  const summary = rows
    .map((r) => `Document: ${r.filename}\n${columnNames.map((col) => `  ${col}: ${r.values[col] ?? "—"}`).join("\n")}`)
    .join("\n\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `You are synthesizing extracted data from multiple legal documents into a single consensus row.
For each field, provide a brief synthesis that captures what is common, or highlights key differences across all documents.
Return ONLY a valid JSON object with the same column names as keys and synthesized string values.`,
    messages: [
      {
        role: "user",
        content: `Synthesize a consensus row from these document extractions:\n\n${summary}\n\nColumns: ${columnNames.map((c) => `"${c}"`).join(", ")}`,
      },
    ],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "{}";
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return Object.fromEntries(columnNames.map((c) => [c, null]));
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasPage(session, "matrix")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const formData = await req.formData();
  const templateId = Number(formData.get("templateId"));
  if (!templateId) return new Response(JSON.stringify({ error: "templateId required" }), { status: 400 });

  const template = await getMatrixTemplate(templateId, session.userId);
  if (!template) return new Response(JSON.stringify({ error: "Template not found" }), { status: 404 });

  const columns = await getMatrixTemplateColumns(templateId);
  if (columns.length === 0) return new Response(JSON.stringify({ error: "Template has no columns" }), { status: 400 });

  const files: File[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("file_") && value instanceof File) files.push(value);
  }
  if (files.length === 0) return new Response(JSON.stringify({ error: "No files provided" }), { status: 400 });

  const encoder = new TextEncoder();
  const rows: { filename: string; values: Record<string, string | null> }[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          emit(controller, encoder, {
            type: "progress",
            current: i + 1,
            total: files.length,
            file: file.name,
          });

          let values: Record<string, string | null>;
          try {
            const buffer = Buffer.from(await file.arrayBuffer());
            const text = await parseFile(buffer, file.name);
            values = await extractFromText(text, columns);
          } catch (e) {
            values = Object.fromEntries(
              columns.map((c) => [c.column_name, `Error: ${e instanceof Error ? e.message : "failed"}`])
            );
          }

          rows.push({ filename: file.name, values });
          emit(controller, encoder, { type: "row", filename: file.name, values });
        }

        // Consensus row
        emit(controller, encoder, { type: "progress", current: files.length, total: files.length, file: "Building consensus…" });
        const consensusValues = await buildConsensus(rows, columns);
        emit(controller, encoder, { type: "consensus", values: consensusValues });
        emit(controller, encoder, { type: "done" });
      } catch (e) {
        emit(controller, encoder, { type: "error", message: e instanceof Error ? e.message : "Extraction failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
