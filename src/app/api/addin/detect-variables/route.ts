import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { logAction, getClientIp } from "@/lib/audit";
import { checkAiRateLimit } from "@/lib/rateLimit";
import { getMatrixTemplate, getMatrixTemplateColumns } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(req);

  const rateLimit = await checkAiRateLimit(session);
  if (!rateLimit.allowed) {
    const resetTime = rateLimit.resetsAt
      ? new Date(rateLimit.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "later";
    return NextResponse.json({ error: `AI token limit reached. Resets at ${resetTime}.` }, { status: 429 });
  }

  try {
    const { templateId, documentText } = await req.json();
    if (!templateId) return NextResponse.json({ error: "templateId is required" }, { status: 400 });
    if (!documentText?.trim()) return NextResponse.json({ error: "documentText is required" }, { status: 400 });

    const template = await getMatrixTemplate(Number(templateId), session.userId);
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const columns = await getMatrixTemplateColumns(Number(templateId));
    if (columns.length === 0) return NextResponse.json({ error: "Template has no columns" }, { status: 400 });

    const columnList = columns
      .map((c) => `- "${c.column_name}"${c.instruction ? `: ${c.instruction}` : ""}`)
      .join("\n");

    const excerpt = documentText.slice(0, 12000);

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      tools: [
        {
          name: "report_variables",
          description: "Report the verbatim document text that corresponds to each template variable.",
          input_schema: {
            type: "object",
            properties: {
              variables: {
                type: "array",
                description: "One entry per variable for which a clear value was found in the document.",
                items: {
                  type: "object",
                  properties: {
                    column_name: { type: "string", description: "The exact column name from the provided list." },
                    matched_text: { type: "string", description: "The value text copied VERBATIM and contiguously from the document, so it can be located and replaced. The value itself, not the surrounding label. Under 200 characters." },
                  },
                  required: ["column_name", "matched_text"],
                },
              },
            },
            required: ["variables"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_variables" },
      system: `You are converting a filled-in legal document into a reusable template. For each variable (column) below, find the EXACT literal text in the document that represents that variable's current value, and report it via the report_variables tool.

Rules:
- matched_text must be an exact, contiguous substring of the document so it can be located and replaced — do not paraphrase or add quotes.
- Keep matched_text as short as possible while still uniquely identifying the value (the value itself, not the surrounding label).
- Only include a column if you find a clear, specific value in the document. Omit columns with no obvious value.

Columns:
${columnList}`,
      messages: [
        { role: "user", content: `Find the current value text for each variable in this document:\n\n${excerpt}` },
      ],
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    let variables: { column_name: string; matched_text: string }[];
    if (toolUse && toolUse.type === "tool_use") {
      const input = toolUse.input as { variables?: { column_name: string; matched_text: string }[] };
      variables = Array.isArray(input.variables) ? input.variables : [];
    } else {
      const truncated = message.stop_reason === "max_tokens";
      console.error("[detect-variables] no tool_use block; stop_reason:", message.stop_reason);
      return NextResponse.json({
        error: truncated
          ? "The document has too many variables to detect in one pass. Try a template with fewer columns, or insert variables manually."
          : "Could not detect variables from the document. Try again or insert variables manually.",
      }, { status: 500 });
    }

    // Keep only proposals whose matched_text actually appears in the document and maps to a real column
    const columnNames = new Set(columns.map((c) => c.column_name));
    const filtered = variables.filter(
      (v) => v.column_name && v.matched_text && columnNames.has(v.column_name) && documentText.includes(v.matched_text)
    );

    await logAction({
      username: session.email,
      action: "Matrix Detect Variables (Word)",
      details: { source: "word-addin", templateId, templateName: template.name, found: filtered.length },
      tokensInput: message.usage.input_tokens,
      tokensOutput: message.usage.output_tokens,
      success: true,
      ipAddress: ip,
    });

    return NextResponse.json({ variables: filtered });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    await logAction({ username: session.email, action: "Matrix Detect Variables (Word)", details: { error: message, source: "word-addin" }, success: false, ipAddress: ip });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
