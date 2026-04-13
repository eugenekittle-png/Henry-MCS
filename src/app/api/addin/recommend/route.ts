import { NextRequest } from "next/server";
import { createStream, parseApiError, isOverloadedError } from "@/lib/anthropic";
import { ASSIST_SYSTEM_PROMPT } from "@/lib/constants";
import { getSessionFromRequest } from "@/lib/auth";
import { logAction, getClientIp } from "@/lib/audit";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip = getClientIp(req);

  try {
    const { text, prompt, client, matter, clientNumber, matterNumber } = await req.json();

    if (!text?.trim()) {
      return Response.json({ error: "Document text is required" }, { status: 400 });
    }
    if (!prompt?.trim()) {
      return Response.json({ error: "A request is required" }, { status: 400 });
    }

    const context = [client && `Client: ${client}`, matter && `Matter: ${matter}`].filter(Boolean).join("\n");
    const userMessage = `${context ? context + "\n\n" : ""}Here is the document text:\n\n${text}\n\n${prompt}`;

    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 3000;

    const encoder = new TextEncoder();
    let tokensInput = 0;
    let tokensOutput = 0;

    const readable = new ReadableStream({
      async start(controller) {
        let success = true;
        let lastErr: unknown;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          if (attempt > 1) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt - 1)));
          }
          try {
            const stream = createStream(ASSIST_SYSTEM_PROMPT, userMessage);
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
            lastErr = undefined;
            break; // success — exit retry loop
          } catch (err) {
            lastErr = err;
            if (!isOverloadedError(err) || attempt === MAX_ATTEMPTS) break;
            // Overloaded and retries remain — loop
          }
        }

        if (lastErr !== undefined) {
          success = false;
          const message = parseApiError(lastErr);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
          controller.close();
        }

        logAction({
          username: session.email,
          action: "Ask",
          clientNumber: clientNumber || null,
          matterNumber: matterNumber || null,
          details: { source: "word-addin", prompt: prompt.slice(0, 200), client: client || undefined, matter: matter || undefined },
          tokensInput,
          tokensOutput,
          success,
          ipAddress: ip,
        });
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    logAction({ username: session.email, action: "Recommend", details: { error: message, source: "word-addin" }, success: false, ipAddress: ip });
    return Response.json({ error: message }, { status: 500 });
  }
}
