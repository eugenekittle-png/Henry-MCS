import { NextRequest } from "next/server";
import { parseZip } from "@/lib/parsers/zip";
import { createChatStream } from "@/lib/anthropic";
import { BREAKDOWN_SYSTEM_PROMPT, MAX_BREAKDOWN_FILE_SIZE } from "@/lib/constants";
import type { TextBlockParam, ImageBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { getClient, getMatter } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAction, getClientIp } from "@/lib/audit";

export const maxDuration = 300;

function emit(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const ip = getClientIp(req);

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (ext !== ".zip") return Response.json({ error: "Please upload a .zip file" }, { status: 400 });
    if (file.size > MAX_BREAKDOWN_FILE_SIZE) return Response.json({ error: "File too large (max 50MB)" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());

    const clientId = formData.get("clientId");
    const matterId = formData.get("matterId");
    let contextPrefix = "";
    const contextDetails: Record<string, unknown> = { file: file.name };
    let clientNumber: string | null = null;
    let matterNumber: string | null = null;

    if (clientId && matterId) {
      const client = await getClient(parseInt(clientId as string, 10));
      const matter = await getMatter(parseInt(matterId as string, 10));
      if (client && matter) {
        contextPrefix = `This analysis is for Client: ${client.name} (${client.client_number}), Matter: ${matter.description} (${matter.matter_number}).\n\n`;
        clientNumber = client.client_number;
        matterNumber = matter.matter_number;
      }
    }

    const encoder = new TextEncoder();
    let tokensInput = 0;
    let tokensOutput = 0;

    const readable = new ReadableStream({
      async start(controller) {
        let success = true;
        try {
          // Phase 1: parse files with progress events
          emit(controller, encoder, { progress: { stage: "parsing", current: 0, total: 0, file: "" } });

          const documents = await parseZip(buffer, (current, total, name) => {
            emit(controller, encoder, { progress: { stage: "parsing", current, total, file: name } });
          });

          if (!documents.length) {
            emit(controller, encoder, { error: "No supported documents found in the zip file" });
            controller.close();
            return;
          }

          contextDetails.documentCount = documents.length;

          // Phase 2: send to Claude with mixed text/image content
          emit(controller, encoder, { progress: { stage: "analyzing", current: documents.length, total: documents.length, file: "" } });

          const contentBlocks: Array<TextBlockParam | ImageBlockParam> = [];
          contentBlocks.push({ type: "text", text: `${contextPrefix}Here is a collection of ${documents.length} file${documents.length !== 1 ? "s" : ""} extracted from a zip file. Please catalog and analyze them:\n\n<documents>` });

          for (const doc of documents) {
            contentBlocks.push({ type: "text", text: `\n\n=== ${doc.name} (${doc.type}) ===\n` });
            if (doc.imageData) {
              contentBlocks.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: doc.imageData.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                  data: doc.imageData.base64,
                },
              });
            } else if (doc.pdfData) {
              // Scanned PDF — send raw bytes for Claude to read natively
              contentBlocks.push({
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: doc.pdfData },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any);
            } else {
              contentBlocks.push({ type: "text", text: doc.content });
            }
          }

          contentBlocks.push({ type: "text", text: "\n</documents>" });

          const stream = createChatStream(BREAKDOWN_SYSTEM_PROMPT, [{ role: "user", content: contentBlocks }]);

          for await (const event of stream) {
            if (event.type === "message_start") {
              tokensInput = event.message.usage.input_tokens;
            } else if (event.type === "message_delta") {
              tokensOutput = event.usage.output_tokens;
            } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              emit(controller, encoder, { text: event.delta.text });
            }
          }

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          success = false;
          const message = err instanceof Error ? err.message : "Stream error";
          emit(controller, encoder, { error: message });
          controller.close();
        } finally {
          logAction({ username: session?.username ?? null, action: "Breakdown", clientNumber, matterNumber, details: contextDetails, tokensInput, tokensOutput, success, ipAddress: ip });
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    logAction({ username: session?.username ?? null, action: "Breakdown", details: { error: message }, success: false, ipAddress: ip });
    return Response.json({ error: message }, { status: 500 });
  }
}
