import { NextRequest } from "next/server";
import { parseFile } from "@/lib/parsers";
import { createStream } from "@/lib/anthropic";
import { SUMMARY_SYSTEM_PROMPT, MAX_FILE_SIZE, SUPPORTED_EXTENSIONS } from "@/lib/constants";
import { getClient, getMatter } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAction } from "@/lib/audit";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await getSession();

  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    const hasEdgar = !!formData.get("edgarFilings");
    if (!files.length && !hasEdgar) {
      return Response.json({ error: "No files or EDGAR filings provided" }, { status: 400 });
    }

    const documentTexts: string[] = [];
    for (const file of files) {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext) || ext === ".zip") {
        return Response.json({ error: `Unsupported file type: ${file.name}` }, { status: 400 });
      }
      if (file.size > MAX_FILE_SIZE) {
        return Response.json({ error: `File too large: ${file.name} (max 10MB)` }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await parseFile(buffer, file.name);
      documentTexts.push(`=== ${file.name} ===\n${text}`);
    }

    // Fetch EDGAR filings if provided
    const edgarFilingsRaw = formData.get("edgarFilings");
    const edgarFilingNames: string[] = [];
    if (edgarFilingsRaw) {
      const edgarFilings = JSON.parse(edgarFilingsRaw as string) as { company: string; cik: string; formType: string; filingDate: string; accessionNo: string; primaryDocument?: string }[];
      for (const filing of edgarFilings) {
        const params = new URLSearchParams({ cik: filing.cik, accession: filing.accessionNo });
        if (filing.primaryDocument) params.set("primaryDocument", filing.primaryDocument);
        const contentRes = await fetch(`${req.nextUrl.origin}/api/edgar/content?${params}`);
        if (contentRes.ok) {
          const { text } = await contentRes.json();
          const label = `${filing.company} — ${filing.formType} (Filed ${filing.filingDate})`;
          documentTexts.push(`=== ${label} [SEC EDGAR] ===\n${text}`);
          edgarFilingNames.push(label);
        }
      }
    }

    if (!documentTexts.length) {
      return Response.json({ error: "No content could be extracted from the provided sources" }, { status: 400 });
    }

    const combinedContent = documentTexts.join("\n\n---\n\n");

    let contextPrefix = "";
    const contextDetails: Record<string, unknown> = {
      files: files.map(f => f.name),
      ...(edgarFilingNames.length ? { edgarFilings: edgarFilingNames } : {}),
    };
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

    const userMessage = `${contextPrefix}Here are the documents to summarize:\n\n${combinedContent}`;
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
          logAction({ username: session?.username ?? null, action: "summarize", clientNumber, matterNumber, details: contextDetails, tokensInput, tokensOutput, success });
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    logAction({ username: session?.username ?? null, action: "summarize", details: { error: message }, success: false });
    return Response.json({ error: message }, { status: 500 });
  }
}
