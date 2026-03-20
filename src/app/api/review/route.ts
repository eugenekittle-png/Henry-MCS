import { NextRequest } from "next/server";
import { parseFile } from "@/lib/parsers";
import { createStream } from "@/lib/anthropic";
import { PLAYBOOK_REVIEW_SYSTEM_PROMPT, MAX_FILE_SIZE, SUPPORTED_EXTENSIONS } from "@/lib/constants";
import { getClient, getMatter, getPlaybook, getPlaybookItems } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await getSession();

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const playbookId = formData.get("playbookId");

    if (!file) return Response.json({ error: "No file provided" }, { status: 400 });
    if (!playbookId) return Response.json({ error: "No playbook selected" }, { status: 400 });

    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext) || ext === ".zip") {
      return Response.json({ error: `Unsupported file type: ${file.name}` }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: `File too large: ${file.name} (max 10MB)` }, { status: 400 });
    }

    const [playbook, items] = await Promise.all([
      getPlaybook(parseInt(playbookId as string, 10)),
      getPlaybookItems(parseInt(playbookId as string, 10)),
    ]);

    if (!playbook) return Response.json({ error: "Playbook not found" }, { status: 404 });
    if (!items.length) return Response.json({ error: "Playbook has no items" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await parseFile(buffer, file.name);

    const playbookText = items.map((item, i) => `${i + 1}. **${item.check_name}** — ${item.instruction}`).join("\n");

    let contextPrefix = "";
    const contextDetails: Record<string, unknown> = { file: file.name, playbook: playbook.name };
    let clientNumber: string | null = null;
    let matterNumber: string | null = null;
    const clientId = formData.get("clientId");
    const matterId = formData.get("matterId");
    if (clientId && matterId) {
      const client = await getClient(parseInt(clientId as string, 10));
      const matter = await getMatter(parseInt(matterId as string, 10));
      if (client && matter) {
        contextPrefix = `This review is for Client: ${client.name} (${client.client_number}), Matter: ${matter.description} (${matter.matter_number}).\n\n`;
        clientNumber = client.client_number;
        matterNumber = matter.matter_number;
      }
    }

    const userMessage = `${contextPrefix}**Playbook: ${playbook.name}**\n\nChecklist items:\n${playbookText}\n\n---\n\n**Document to review:**\n\n<documents>\n=== ${file.name} ===\n${text}\n</documents>`;

    const stream = createStream(PLAYBOOK_REVIEW_SYSTEM_PROMPT, userMessage);
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
          logAction({ username: session?.username ?? null, action: "Review", clientNumber, matterNumber, details: contextDetails, tokensInput, tokensOutput, success });
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    logAction({ username: session?.username ?? null, action: "Review", details: { error: message }, success: false });
    return Response.json({ error: message }, { status: 500 });
  }
}
