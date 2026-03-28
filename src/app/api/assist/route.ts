import { NextRequest } from "next/server";
import { parseFile } from "@/lib/parsers";
import { createChatStream } from "@/lib/anthropic";
import { ASSIST_SYSTEM_PROMPT, MAX_FILE_SIZE, SUPPORTED_EXTENSIONS } from "@/lib/constants";
import { detectSuspicious } from "@/lib/security";
import { getClient, getMatter } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAction, getClientIp } from "@/lib/audit";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await getSession();
  const ip = getClientIp(req);

  try {
    const formData = await req.formData();
    const prompt = (formData.get("prompt") as string)?.trim();
    const messagesRaw = formData.get("messages") as string | null;
    const clientId = formData.get("clientId") as string;
    const matterId = formData.get("matterId") as string;
    const files = formData.getAll("files") as File[];

    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Parse conversation history
    let history: MessageParam[] = [];
    if (messagesRaw) {
      try { history = JSON.parse(messagesRaw); } catch { /* ignore */ }
    }

    // Get client/matter context
    let contextPrefix = "";
    let clientNumber: string | null = null;
    let matterNumber: string | null = null;
    if (clientId && matterId) {
      const client = await getClient(parseInt(clientId, 10));
      const matter = await getMatter(parseInt(matterId, 10));
      if (client && matter) {
        contextPrefix = `This conversation is for Client: ${client.name} (${client.client_number}), Matter: ${matter.description} (${matter.matter_number}).\n\n`;
        clientNumber = client.client_number;
        matterNumber = matter.matter_number;
      }
    }

    // Parse uploaded files (first message only)
    let documentContext = "";
    const fileNames: string[] = [];
    for (const file of files) {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext) || ext === ".zip") continue;
      if (file.size > MAX_FILE_SIZE) continue;
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await parseFile(buffer, file.name);
      documentContext += `=== ${file.name} ===\n${text}\n\n`;
      fileNames.push(file.name);
    }

    const suspiciousFlags = detectSuspicious(prompt);

    const userContent = `${contextPrefix}${documentContext ? `The following documents have been provided for context:\n\n<documents>\n${documentContext}</documents>\n\n` : ""}${prompt}`;

    const apiMessages: MessageParam[] = [
      ...history,
      { role: "user", content: userContent },
    ];

    const stream = createChatStream(ASSIST_SYSTEM_PROMPT, apiMessages);

    const encoder = new TextEncoder();
    let tokensInput = 0;
    let tokensOutput = 0;

    const readable = new ReadableStream({
      async start(controller) {
        let success = true;
        try {
          // Send metadata event so client can store the full user message for history
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ meta: true, userMessage: userContent })}\n\n`));

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
          logAction({
            username: session?.username ?? null,
            action: "Assist",
            clientNumber,
            matterNumber,
            details: {
              prompt: suspiciousFlags.length > 0 ? prompt : prompt.slice(0, 200),
              files: fileNames,
              ...(suspiciousFlags.length > 0 ? { suspicious: true, suspiciousFlags } : {}),
            },
            tokensInput,
            tokensOutput,
            success,
            ipAddress: ip,
          });
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    logAction({ username: session?.username ?? null, action: "Assist", details: { error: message }, success: false, ipAddress: ip });
    return Response.json({ error: message }, { status: 500 });
  }
}
