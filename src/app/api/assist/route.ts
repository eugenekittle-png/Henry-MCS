import { NextRequest } from "next/server";
import { parseFile } from "@/lib/parsers";
import { createChatStream } from "@/lib/anthropic";
import { ASSIST_SYSTEM_PROMPT, MAX_FILE_SIZE, SUPPORTED_EXTENSIONS } from "@/lib/constants";
import { detectSuspicious } from "@/lib/security";
import { getClient, getMatter } from "@/lib/db";
import { getSession, hasPage } from "@/lib/auth";
import { logAction, getClientIp } from "@/lib/audit";
import { checkAiRateLimit } from "@/lib/rateLimit";
import { fetchCourtListenerText } from "@/lib/courtlistener";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await getSession();
  const ip = getClientIp(req);
  if (!session || !hasPage(session, "assist")) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimit = await checkAiRateLimit(session);
  if (!rateLimit.allowed) {
    const resetTime = rateLimit.resetsAt ? new Date(rateLimit.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "later";
    return Response.json({ error: `AI token limit reached. Resets at ${resetTime}.`, rateLimited: true, used: rateLimit.used, limit: rateLimit.limit, resetsAt: rateLimit.resetsAt }, { status: 429 });
  }

  try {
    const formData = await req.formData();
    const prompt = (formData.get("prompt") as string)?.trim();
    const messagesRaw = formData.get("messages") as string | null;
    const clientId = formData.get("clientId") as string;
    const matterId = formData.get("matterId") as string;
    const files = formData.getAll("files") as File[];
    const edgarFilingsRaw = formData.get("edgarFilings") as string | null;
    const courtOpinionsRaw = formData.get("courtlistenerOpinions") as string | null;

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

    // Parse uploaded files — scanned/corrupt PDFs fall back to Claude native document blocks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBlocks: { type: "document"; source: any }[] = [];
    let documentContext = "";
    const fileNames: string[] = [];
    for (const file of files) {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext) || ext === ".zip") continue;
      if (file.size > MAX_FILE_SIZE) continue;
      const buffer = Buffer.from(await file.arrayBuffer());
      let text = "";
      let usePdfFallback = false;
      try {
        text = await parseFile(buffer, file.name);
        if (ext === ".pdf" && text.trim().length < 100) usePdfFallback = true;
      } catch {
        if (ext === ".pdf") usePdfFallback = true;
        else continue;
      }
      if (usePdfFallback) {
        pdfBlocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } });
      } else {
        documentContext += `=== ${file.name} ===\n${text}\n\n`;
      }
      fileNames.push(file.name);
    }

    // Fetch EDGAR filings if provided (first message only)
    const edgarFilingNames: string[] = [];
    if (edgarFilingsRaw) {
      const edgarFilings = JSON.parse(edgarFilingsRaw) as { company: string; cik: string; formType: string; filingDate: string; accessionNo: string; primaryDocument?: string }[];
      for (const filing of edgarFilings) {
        const params = new URLSearchParams({ cik: filing.cik, accession: filing.accessionNo });
        if (filing.primaryDocument) params.set("primaryDocument", filing.primaryDocument);
        const contentRes = await fetch(`${req.nextUrl.origin}/api/edgar/content?${params}`);
        if (contentRes.ok) {
          const { text } = await contentRes.json();
          const label = `${filing.company} — ${filing.formType} (Filed ${filing.filingDate})`;
          documentContext += `=== ${label} [SEC EDGAR] ===\n${text}\n\n`;
          edgarFilingNames.push(label);
        }
      }
    }

    // Fetch CourtListener opinions if provided (first message only)
    const courtOpinionNames: string[] = [];
    if (courtOpinionsRaw) {
      const courtOpinions = JSON.parse(courtOpinionsRaw) as { clusterId: number; caseName: string; citation: string; court: string; dateFiled: string }[];
      for (const opinion of courtOpinions) {
        const label = `${opinion.caseName}${opinion.citation ? `, ${opinion.citation}` : ""}${opinion.dateFiled ? ` (${opinion.dateFiled})` : ""}`;
        const text = await fetchCourtListenerText(opinion.clusterId);
        if (text) {
          documentContext += `=== ${label} [CourtListener] ===\n${text}\n\n`;
        } else {
          documentContext += `=== ${label} [CourtListener — full text unavailable] ===\n[The full opinion text could not be retrieved from CourtListener. Use your knowledge of this case to assist.]\n\n`;
        }
        courtOpinionNames.push(label);
      }
    }

    const suspiciousFlags = detectSuspicious(prompt);

    const textContent = `${contextPrefix}${documentContext ? `The following documents have been provided for context:\n\n<documents>\n${documentContext}</documents>\n\n` : ""}${prompt}`;

    // If any PDFs needed native reading, build a mixed content array; otherwise use plain string
    const userMessageContent = pdfBlocks.length > 0
      ? [...pdfBlocks, { type: "text" as const, text: textContent }]
      : textContent;

    // History always stores plain text (PDF blocks noted for context)
    const userContent = pdfBlocks.length > 0
      ? `${textContent}\n\n[${pdfBlocks.length} PDF(s) sent as native document]`
      : textContent;

    const apiMessages: MessageParam[] = [
      ...history,
      { role: "user", content: userMessageContent as MessageParam["content"] },
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
            username: session?.email ?? null,
            action: "Assist",
            clientNumber,
            matterNumber,
            details: {
              prompt: suspiciousFlags.length > 0 ? prompt : prompt.slice(0, 200),
              files: fileNames,
              ...(edgarFilingNames.length > 0 ? { edgarFilings: edgarFilingNames } : {}),
              ...(courtOpinionNames.length > 0 ? { courtlistener: courtOpinionNames } : {}),
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
    logAction({ username: session?.email ?? null, action: "Assist", details: { error: message }, success: false, ipAddress: ip });
    return Response.json({ error: message }, { status: 500 });
  }
}
