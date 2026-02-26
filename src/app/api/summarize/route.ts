import { NextRequest } from "next/server";
import { parseFile } from "@/lib/parsers";
import { createStream } from "@/lib/anthropic";
import { SUMMARY_SYSTEM_PROMPT, MAX_FILE_SIZE, SUPPORTED_EXTENSIONS } from "@/lib/constants";
import { getClient, getMatter } from "@/lib/db";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return Response.json({ error: "No files provided" }, { status: 400 });
    }

    // Parse all files
    const documentTexts: string[] = [];
    for (const file of files) {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext) || ext === ".zip") {
        return Response.json(
          { error: `Unsupported file type: ${file.name}` },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return Response.json(
          { error: `File too large: ${file.name} (max 10MB)` },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await parseFile(buffer, file.name);
      documentTexts.push(`=== ${file.name} ===\n${text}`);
    }

    const combinedContent = documentTexts.join("\n\n---\n\n");

    // Build client/matter context
    let contextPrefix = "";
    const clientId = formData.get("clientId");
    const matterId = formData.get("matterId");
    if (clientId && matterId) {
      const client = getClient(parseInt(clientId as string, 10));
      const matter = getMatter(parseInt(matterId as string, 10));
      if (client && matter) {
        contextPrefix = `This analysis is for Client: ${client.name} (${client.client_number}), Matter: ${matter.description} (${matter.matter_number}).\n\n`;
      }
    }

    const userMessage = `${contextPrefix}Here are the documents to summarize:\n\n${combinedContent}`;

    const stream = createStream(SUMMARY_SYSTEM_PROMPT, userMessage);

    // Convert SDK stream to SSE
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const data = JSON.stringify({ text: event.delta.text });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : "Stream error";
          const data = JSON.stringify({ error: message });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
