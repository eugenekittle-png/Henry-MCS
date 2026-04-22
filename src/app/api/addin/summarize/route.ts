import { NextRequest } from "next/server";
import { createStream } from "@/lib/anthropic";
import { SUMMARY_SYSTEM_PROMPT } from "@/lib/constants";
import { getSessionFromRequest } from "@/lib/auth";
import { logAction, getClientIp } from "@/lib/audit";
import { checkAiRateLimit } from "@/lib/rateLimit";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip = getClientIp(req);

  const rateLimit = await checkAiRateLimit(session);
  if (!rateLimit.allowed) {
    const resetTime = rateLimit.resetsAt ? new Date(rateLimit.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "later";
    return Response.json({ error: `AI token limit reached. Resets at ${resetTime}.`, rateLimited: true, used: rateLimit.used, limit: rateLimit.limit, resetsAt: rateLimit.resetsAt }, { status: 429 });
  }

  try {
    const { text, filename, client, matter } = await req.json();

    if (!text?.trim()) {
      return Response.json({ error: "Document text is required" }, { status: 400 });
    }

    const context = [client && `Client: ${client}`, matter && `Matter: ${matter}`].filter(Boolean).join("\n");
    const userMessage = `${context ? context + "\n\n" : ""}Here are the documents to summarize:\n\n=== ${filename || "Document"} ===\n${text}`;
    const stream = createStream(SUMMARY_SYSTEM_PROMPT, userMessage);

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
          logAction({
            username: session.email,
            action: "Summarize",
            details: { source: "word-addin", filename: filename || "Document", client: client || undefined, matter: matter || undefined },
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
    await logAction({ username: session.email, action: "Summarize", details: { error: message, source: "word-addin" }, success: false, ipAddress: ip });
    return Response.json({ error: message }, { status: 500 });
  }
}
