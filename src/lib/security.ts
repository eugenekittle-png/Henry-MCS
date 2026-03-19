/**
 * Detects common prompt injection and misuse patterns in user-supplied text.
 * Returns a list of matched pattern names, or an empty array if none found.
 */

const INJECTION_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "ignore_instructions",   pattern: /ignore\s+(all\s+)?(previous|prior|above|your|the)\s+(instructions?|prompts?|rules?|guidelines?|system)/i },
  { name: "disregard_instructions",pattern: /disregard\s+(all\s+)?(previous|prior|above|your|the)\s+(instructions?|prompts?|rules?|guidelines?|system)/i },
  { name: "override_instructions", pattern: /override\s+(your\s+)?(instructions?|prompts?|rules?|programming|guidelines?)/i },
  { name: "forget_instructions",   pattern: /forget\s+(all\s+)?(previous|prior|your|the)\s+(instructions?|prompts?|rules?|guidelines?)/i },
  { name: "new_instructions",      pattern: /new\s+instructions?\s*:/i },
  { name: "system_prompt_leak",    pattern: /repeat\s+(your\s+)?(system\s+prompt|instructions?|programming)/i },
  { name: "reveal_prompt",         pattern: /(show|print|output|reveal|display|tell me)\s+(your\s+)?(system\s+prompt|instructions?|programming|prompt)/i },
  { name: "you_are_now",           pattern: /you\s+are\s+now\s+(a|an|the)\s+/i },
  { name: "pretend_act_as",        pattern: /(pretend|act)\s+(you\s+are|to\s+be|as\s+(a|an|the))\s+/i },
  { name: "jailbreak_dan",         pattern: /\bDAN\b|do\s+anything\s+now/i },
  { name: "developer_mode",        pattern: /developer\s+mode|jailbreak\s+mode/i },
  { name: "end_system_prompt",     pattern: /<\/?(system|instructions?|prompt)>/i },
];

export function detectSuspicious(text: string): string[] {
  return INJECTION_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ name }) => name);
}
