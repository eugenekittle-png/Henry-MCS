import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { logAction, getClientIp } from "@/lib/audit";
import { checkAiRateLimit } from "@/lib/rateLimit";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 300;

const SUGGEST_SYSTEM_PROMPT = `You are a legal document reviewer. Analyze the labeled paragraphs provided and return suggested improvements as a JSON object.

Return ONLY a valid JSON object — no markdown, no code fences, no explanation — with this exact structure:
{
  "suggestions": [
    {
      "paragraphIndex": <integer>,
      "replacement": "<complete replacement text for that paragraph>",
      "reason": "<one or two sentence explanation of the improvement>"
    }
  ]
}

Guidelines:
- Only suggest changes where there is a genuine, meaningful improvement to clarity, legal precision, or enforceability
- Each replacement must be the complete paragraph text, not a fragment
- Preserve any formatting conventions (bold markers, numbering, capitalization of defined terms)
- Do not suggest changes to very short paragraphs (headings, single words, standalone numbers)
- Do not suggest purely cosmetic rewording with no substantive benefit
- If no meaningful changes are needed, return {"suggestions": []}`;

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
      { error: `AI token limit reached. Resets at ${resetTime}.`, rateLimited: true },
      { status: 429 },
    );
  }

  try {
    const { paragraphs, client: clientLabel, matter: matterLabel, clientNumber, matterNumber } = await req.json();

    if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
      return NextResponse.json({ error: "No paragraphs provided" }, { status: 400 });
    }

    const documentText = (paragraphs as string[])
      .map((text, i) => `[P${i}] ${text}`)
      .join("\n");

    const contextPrefix =
      clientLabel && matterLabel ? `Context — Client: ${clientLabel}, Matter: ${matterLabel}\n\n` : "";

    const userMessage = `${contextPrefix}Please review the following document paragraphs and suggest improvements:\n\n${documentText}`;

    const anthropic = new Anthropic();
    const message = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 16384,
      system: SUGGEST_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    // Find the text block (skip any thinking blocks)
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "Unexpected response format from AI" }, { status: 500 });
    }

    let result: { suggestions: { paragraphIndex: number; replacement: string; reason: string }[] };
    try {
      // Strip markdown code fences if the model adds them despite instructions
      const raw = textBlock.text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      result = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Could not parse AI response as JSON" }, { status: 500 });
    }

    const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];

    await logAction({
      username: session.email,
      action: "Suggest Changes (Word)",
      clientNumber: clientNumber || null,
      matterNumber: matterNumber || null,
      details: { paragraphCount: paragraphs.length, suggestionCount: suggestions.length },
      tokensInput: message.usage.input_tokens,
      tokensOutput: message.usage.output_tokens,
      success: true,
      ipAddress: ip,
      promptText: userMessage,
      responseText: textBlock.text,
    });

    return NextResponse.json({ suggestions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    await logAction({
      username: session.email,
      action: "Suggest Changes (Word)",
      details: { error: msg },
      success: false,
      ipAddress: ip,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
