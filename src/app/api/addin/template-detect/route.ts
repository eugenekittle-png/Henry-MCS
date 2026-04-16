import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionFromRequest } from "@/lib/auth";
import { logAction, getClientIp } from "@/lib/audit";

export const maxDuration = 120;

const client = new Anthropic();

const DETECT_SYSTEM_PROMPT = `You are a legal document analyst. Your task is to identify all text in a legal document that represents matter-specific variable data — information that would change between different uses of this document as a template.

Focus on finding:
- Person names (clients, opposing parties, counsel, judges, witnesses, signatories)
- Organisation names (companies, firms, trusts, government bodies)
- Specific dates (effective dates, expiry dates, hearing dates — not generic references like "the date of signing")
- Dollar amounts and financial figures
- Addresses and property descriptions
- Case numbers, matter numbers, reference numbers, file numbers
- ABNs, ACNs, registration numbers
- Any other data clearly specific to this particular matter

Do NOT flag:
- Generic legal boilerplate ("the Parties", "this Agreement", "the Court")
- Defined terms that are part of the document structure
- Section references

Group related references to the same real-world entity as a single variable. For example if "John Smith", "Mr Smith", and "the Vendor" all refer to the same person, list them together with occurrences: ["John Smith", "Mr Smith", "the Vendor"].

Return ONLY a valid JSON array. No markdown, no explanation, just the array.

Each element:
{
  "suggestedName": "PascalCase name, e.g. ClientName, EffectiveDate, PurchasePrice",
  "type": "person" | "org" | "date" | "amount" | "address" | "reference" | "other",
  "occurrences": ["exact text variant 1", "exact text variant 2"],
  "description": "one line describing what this variable represents"
}`;

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ip = getClientIp(req);

  try {
    const { text } = await req.json();
    if (!text?.trim()) {
      return Response.json({ error: "Document text is required" }, { status: 400 });
    }

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: DETECT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Analyse this document and return the variable detection JSON array:\n\n${text}` }],
    });

    const rawText = message.content
      .filter(b => b.type === "text")
      .map(b => (b as { type: "text"; text: string }).text)
      .join("");

    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    let variables;
    try {
      variables = JSON.parse(cleaned);
    } catch {
      return Response.json({ error: "Failed to parse variable detection response" }, { status: 500 });
    }

    logAction({
      username: session.email,
      action: "TemplateDetect",
      details: { variablesFound: Array.isArray(variables) ? variables.length : 0, source: "word-addin" },
      tokensInput: message.usage.input_tokens,
      tokensOutput: message.usage.output_tokens,
      success: true,
      ipAddress: ip,
    });

    return Response.json({ variables });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    logAction({ username: session.email, action: "TemplateDetect", details: { error: message }, success: false, ipAddress: ip });
    return Response.json({ error: message }, { status: 500 });
  }
}
