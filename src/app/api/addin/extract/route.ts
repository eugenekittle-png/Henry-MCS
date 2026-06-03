import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { logAction, getClientIp } from "@/lib/audit";
import { checkAiRateLimit } from "@/lib/rateLimit";
import { getMatrixTemplate, getMatrixTemplateColumns } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 120;

const client = new Anthropic();

async function extractFromText(
  text: string,
  columns: { column_name: string; instruction: string | null }[]
): Promise<{ values: Record<string, string | null>; inputTokens: number; outputTokens: number }> {
  const columnList = columns
    .map((c) => `- "${c.column_name}"${c.instruction ? `: ${c.instruction}` : ""}`)
    .join("\n");

  const excerpt = text.slice(0, 10000);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: `You are extracting structured data from a legal document to populate a comparison matrix.
Extract the following fields. Return ONLY a valid JSON object where keys are exactly the column names and values are extracted strings (or null if not found). Keep values concise but complete.

Columns:
${columnList}`,
    messages: [
      { role: "user", content: `Extract the requested fields from this document:\n\n${excerpt}` },
    ],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "{}";
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    return {
      values: JSON.parse(cleaned),
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  } catch {
    return {
      values: Object.fromEntries(columns.map((c) => [c.column_name, null])),
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(req);

  const rateLimit = await checkAiRateLimit(session);
  if (!rateLimit.allowed) {
    const resetTime = rateLimit.resetsAt
      ? new Date(rateLimit.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "later";
    return NextResponse.json(
      { error: `AI token limit reached. Resets at ${resetTime}.`, rateLimited: true, used: rateLimit.used, limit: rateLimit.limit, resetsAt: rateLimit.resetsAt },
      { status: 429 }
    );
  }

  try {
    const { templateId, documentText, clientNumber, matterNumber } = await req.json();

    if (!templateId) return NextResponse.json({ error: "templateId is required" }, { status: 400 });
    if (!documentText?.trim()) return NextResponse.json({ error: "documentText is required" }, { status: 400 });

    const template = await getMatrixTemplate(Number(templateId), session.userId);
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const columns = await getMatrixTemplateColumns(Number(templateId));
    if (columns.length === 0) return NextResponse.json({ error: "Template has no columns" }, { status: 400 });

    const { values, inputTokens, outputTokens } = await extractFromText(documentText, columns);

    await logAction({
      username: session.email,
      action: "Matrix Extract (Word)",
      clientNumber: clientNumber ?? null,
      matterNumber: matterNumber ?? null,
      details: { source: "word-addin", templateId, templateName: template.name },
      tokensInput: inputTokens,
      tokensOutput: outputTokens,
      success: true,
      ipAddress: ip,
    });

    return NextResponse.json({ values, columns: columns.map((c) => c.column_name) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    await logAction({ username: session.email, action: "Matrix Extract (Word)", details: { error: message, source: "word-addin" }, success: false, ipAddress: ip });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
