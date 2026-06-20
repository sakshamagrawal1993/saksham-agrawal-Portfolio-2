export interface HealthTwinChatResponse {
  assistant_reply: string;
  widgets: unknown[];
}

export function normalizeHealthTwinChatResponse(raw: unknown): HealthTwinChatResponse {
  const result = Array.isArray(raw) ? raw[0] : raw;
  const record = result && typeof result === 'object'
    ? result as Record<string, unknown>
    : {};
  const rawReply = record.assistant_reply ?? record.output ?? '';

  let assistantReply = rawReply;
  if (typeof rawReply === 'string') {
    const trimmed = rawReply.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      try {
        assistantReply = JSON.parse(trimmed);
      } catch {
        assistantReply = trimmed
          .slice(1, -1)
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
      }
    }
  }

  return {
    assistant_reply: typeof assistantReply === 'string' ? assistantReply : '',
    widgets: Array.isArray(record.widgets) ? record.widgets : [],
  };
}
