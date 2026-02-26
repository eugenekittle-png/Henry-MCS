import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export function createStream(systemPrompt: string, userContent: string) {
  return client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });
}
