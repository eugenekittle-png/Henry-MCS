import { NextRequest } from "next/server";
import { parseZip } from "@/lib/parsers/zip";
import { createStream } from "@/lib/anthropic";
import { BREAKDOWN_SYSTEM_PROMPT, MAX_FILE_SIZE } from "@/lib/constants";
import { getClient, getMatter } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await getSession();

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (ext !== ".zip") return Response.json({ error: "Please upload a .zip file" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: "File too large (max 10MB)" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const documents = await parseZip(buffer);

    if (!documents.length) {
      return Response.json({ error: "No supported documents found in the zip file" }, { status: 400 });
    }

    const documentTexts = documents.map(doc => `=== ${doc.name} (${doc.type}) ===\n${doc.content}`);
    const combinedContent = documentTexts.join("\n\n---\n\n");

    let contextPrefix = "";
    const contextDetails: Record<string, unknown> = { file: file.name, documentCount: documents.length };
    let clientNumber: string | null = null;
    let matterNumber: string | null = null;
    const clientId = formData.get("clientId");
    const matterId = formData.get("matterId");
    if (clientId && matterId) {
      const client = await getClient(parseInt(clientId as string, 10));
      const matter = await getMatter(parseInt(matterId as string, 10));
      if (client && matter) {
        contextPrefix = `This analysis is for Client: ${client.name} (${client.client_number}), Matter: ${matter.description} (${matter.matter_number}).\n\n`;
        clientNumber = client.client_number;
        matterNumber = matter.matter_number;
      }
    }

    const userMessage = `${contextPrefix}Here is a collection of ${documents.length} documents extracted from a zip file. Please catalog and analyze them:\n\n${combinedContent}`;
    const stream = createStream(BREAKDOWN_SYSTEM_PROMPT, userMessage);

    const encoder = new TextEncoder();
    let tokensInput = 0;
    let tokensOutput = 0;

    const readable = new ReadableStream({
      async start(controller) {
        let success = true;
        try {
          for await (const event of stream) {
            if (event.type === "message_start") {
              tokensInput = event.message.usage.input_tokens;
            } else if (event.type === "message_delta") {
              tokensOutput = event.usage.output_tokens;
            } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          success = false;
          const message = err instanceof Error ? err.message : "Stream error";
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
          controller.close();
        } finally {
          logAction({ username: session?.username ?? null, action: "breakdown", clientNumber, matterNumber, details: contextDetails, tokensInput, tokensOutput, success });
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    logAction({ username: session?.username ?? null, action: "breakdown", details: { error: message }, success: false });
    return Response.json({ error: message }, { status: 500 });
  }
}
