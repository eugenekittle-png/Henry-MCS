import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { checkAiRateLimit } from "@/lib/rateLimit";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimit = await checkAiRateLimit(session);
  if (!rateLimit.allowed) {
    const resetTime = rateLimit.resetsAt
      ? new Date(rateLimit.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "later";
    return NextResponse.json({ error: `AI token limit reached. Resets at ${resetTime}.` }, { status: 429 });
  }

  const { documentText } = await req.json();
  if (!documentText?.trim()) return NextResponse.json({ error: "documentText is required" }, { status: 400 });

  const excerpt = documentText.slice(0, 12000);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You are a legal document analyst. Identify the key data fields present in this document that would be useful to extract into a structured comparison matrix.
Return ONLY a valid JSON array. Each element must have:
- "column_name": a short, clear label (3-6 words max)
- "instruction": a one-sentence description of exactly what to extract (or null if self-explanatory)

Example:
[
  { "column_name": "Parties", "instruction": "Identify all named parties and their roles." },
  { "column_name": "Effective Date", "instruction": null },
  { "column_name": "Governing Law", "instruction": "State the governing law and jurisdiction." }
]

Return 5–15 columns. Focus on fields that meaningfully vary across similar documents.`,
    messages: [
      { role: "user", content: `Analyze this document and suggest extraction columns:\n\n${excerpt}` },
    ],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const columns = JSON.parse(cleaned);
    if (!Array.isArray(columns)) throw new Error("Not an array");
    return NextResponse.json({ columns });
  } catch {
    return NextResponse.json({ error: "Could not parse suggestions from AI response." }, { status: 500 });
  }
}
