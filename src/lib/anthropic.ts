import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

const client = new Anthropic();

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
