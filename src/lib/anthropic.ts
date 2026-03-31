import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

const client = new Anthropic();

/**
 * Converts a raw Anthropic SDK error into a user-friendly message.
 * The SDK sometimes surfaces the full JSON error body as err.message.
 */
export function parseApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Something went wrong";
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.type === "overloaded_error") {
      return "Claude is currently overloaded. Please try again in a moment.";
    }
    if (parsed?.error?.message) return parsed.error.message;
  } catch { /* not JSON — use as-is */ }
  return raw;
}

export function createStream(systemPrompt: string, userContent: string) {
  return client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });
}

export function createChatStream(systemPrompt: string, messages: MessageParam[]) {
  return client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: systemPrompt,
    messages,
  });
}

export function createDocumentStream(systemPrompt: string, pdfBase64: string, contextText: string) {
  return client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{
      role: "user",
      content: [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: pdfBase64,
          },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        { type: "text", text: contextText },
      ],
    }],
  });
}

export function createVisionStream(systemPrompt: string, imageBase64: string, mimeType: string, contextText: string) {
  return client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: imageBase64,
          },
        },
        { type: "text", text: contextText },
      ],
    }],
  });
}
