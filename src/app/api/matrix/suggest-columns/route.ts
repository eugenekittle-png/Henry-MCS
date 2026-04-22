import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, hasPage } from "@/lib/auth";
import { checkAiRateLimit } from "@/lib/rateLimit";
import { parseFile } from "@/lib/parsers";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 120;

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session || !hasPage(session, "matrix")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rateLimit = await checkAiRateLimit(session);
  if (!rateLimit.allowed) {
    const resetTime = rateLimit.resetsAt ? new Date(rateLimit.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "later";
    return NextResponse.json({ error: `AI token limit reached. Resets at ${resetTime}.`, rateLimited: true, used: rateLimit.used, limit: rateLimit.limit, resetsAt: rateLimit.resetsAt }, { status: 429 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const supportedExts = [".pdf", ".doc", ".docx", ".xlsx", ".txt", ".csv", ".md"];
  const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
  if (!supportedExts.includes(ext)) {
    return NextResponse.json({ error: `Unsupported file type. Supported: ${supportedExts.join(", ")}` }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    text = await parseFile(buffer, file.name);
  } catch (e) {
    return NextResponse.json({ error: `Could not read file: ${e instanceof Error ? e.message : "unknown error"}` }, { status: 400 });
  }

  // Truncate to avoid token limits — first 12,000 chars is plenty for column detection
  const excerpt = text.slice(0, 12000);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You are a legal document analyst. Your job is to identify the key data fields present in a document that would be useful to extract into a structured comparison table (a "matrix").
Return ONLY a valid JSON array. Each element must have:
- "column_name": a short, clear label (3-6 words max)
- "instruction": a one-sentence description of exactly what to extract for that field (or null if self-explanatory)

Example output:
[
  { "column_name": "Parties", "instruction": "Identify all named parties and their roles." },
  { "column_name": "Effective Date", "instruction": null },
  { "column_name": "Governing Law", "instruction": "State the governing law and jurisdiction." }
]

Return 5–15 columns. Focus on fields that would meaningfully vary across similar documents.`,
    messages: [
      {
        role: "user",
        content: `Analyze this document and suggest extraction columns for a matrix:\n\n${excerpt}`,
      },
    ],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";

  let columns: { column_name: string; instruction: string | null }[];
  try {
    // Strip any markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    columns = JSON.parse(cleaned);
    if (!Array.isArray(columns)) throw new Error("Not an array");
  } catch {
    return NextResponse.json({ error: "Could not parse suggestions from AI response." }, { status: 500 });
  }

  return NextResponse.json({ columns });
}
