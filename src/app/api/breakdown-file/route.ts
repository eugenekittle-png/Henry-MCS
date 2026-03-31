import { NextRequest } from "next/server";
import JSZip from "jszip";
import { parseFile } from "@/lib/parsers";
import { parseImage, IMAGE_EXTS } from "@/lib/parsers/image";
import { createStream, createVisionStream, createDocumentStream } from "@/lib/anthropic";
import { SUMMARY_SYSTEM_PROMPT, IMAGE_ANALYSIS_SYSTEM_PROMPT, MAX_BREAKDOWN_FILE_SIZE } from "@/lib/constants";
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
    const zipFile = formData.get("file") as File | null;
    const filePath = formData.get("filePath") as string | null;

    if (!zipFile) return Response.json({ error: "No file provided" }, { status: 400 });
    if (!filePath) return Response.json({ error: "No filePath specified" }, { status: 400 });
    if (zipFile.size > MAX_BREAKDOWN_FILE_SIZE) return Response.json({ error: "File too large (max 50MB)" }, { status: 400 });

    const buffer = Buffer.from(await zipFile.arrayBuffer());
    const zip = await JSZip.loadAsync(buffer);

    const entry = zip.files[filePath];
    if (!entry || entry.dir) return Response.json({ error: `File not found in zip: ${filePath}` }, { status: 404 });

    const fileBuffer = Buffer.from(await entry.async("arraybuffer"));
    const fileName = filePath.split("/").pop() || filePath;

    const fileExt = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")).toLowerCase() : "";
    const isImage = IMAGE_EXTS.has(fileExt);

    let contextPrefix = "";
    const contextDetails: Record<string, unknown> = { zipFile: zipFile.name, file: filePath };
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

    let stream: ReturnType<typeof createStream>;
    if (isImage) {
      let imageData: { base64: string; mimeType: string };
      try {
        imageData = await parseImage(fileBuffer, fileName);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return Response.json({ error: msg }, { status: 400 });
      }
      const contextText = contextPrefix
        ? `${contextPrefix}Please analyze this image from the discovery document set.`
        : "Please analyze this image from the discovery document set.";
      stream = createVisionStream(IMAGE_ANALYSIS_SYSTEM_PROMPT, imageData.base64, imageData.mimeType, contextText) as ReturnType<typeof createStream>;
    } else {
      let text: string;
      try {
        text = await parseFile(fileBuffer, fileName);
      } catch {
        return Response.json({ error: `Could not parse ${fileName}` }, { status: 400 });
      }
      // Detect scanned PDF — fall back to Claude's native PDF reading
      if (fileExt === ".pdf" && text.trim().length < 100) {
        const contextText = contextPrefix
          ? `${contextPrefix}Please summarize this document.`
          : "Please summarize this document.";
        stream = createDocumentStream(SUMMARY_SYSTEM_PROMPT, fileBuffer.toString("base64"), contextText) as ReturnType<typeof createStream>;
      } else {
        const userMessage = `${contextPrefix}Here is the document to summarize:\n\n<documents>\n=== ${fileName} ===\n${text}\n</documents>`;
        stream = createStream(SUMMARY_SYSTEM_PROMPT, userMessage);
      }
    }

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
          logAction({ username: session?.username ?? null, action: "Breakdown-File", clientNumber, matterNumber, details: contextDetails, tokensInput, tokensOutput, success, ipAddress: ip });
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    logAction({ username: session?.username ?? null, action: "Breakdown-File", details: { error: message }, success: false, ipAddress: ip });
    return Response.json({ error: message }, { status: 500 });
  }
}
