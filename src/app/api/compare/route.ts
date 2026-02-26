import { NextRequest } from "next/server";
import { parseFile } from "@/lib/parsers";
import { createStream } from "@/lib/anthropic";
import { COMPARE_SYSTEM_PROMPT, MAX_FILE_SIZE, COMPARE_EXTENSIONS } from "@/lib/constants";
import { getClient, getMatter } from "@/lib/db";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
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

    const userMessage = `${contextPrefix}Please compare the following two documents:\n\n=== Document 1: ${file1.name} ===\n${text1}\n\n---\n\n=== Document 2: ${file2.name} ===\n${text2}`;

    const stream = createStream(COMPARE_SYSTEM_PROMPT, userMessage);

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
