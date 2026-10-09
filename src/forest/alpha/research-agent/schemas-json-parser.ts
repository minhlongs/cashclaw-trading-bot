// CashClaw Alpha Research OS — JSON parser utilities for ResearchAgent
export function cleanJsonString(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    const lines = trimmed.split('\n');
    const filtered = lines.slice(1, lines[lines.length - 1].trim() === '```' ? -1 : undefined);
    return filtered.join('\n').trim();
  }
  return trimmed;
}

export function parseRawJson(rawJson: string, context: string): unknown {
  try {
    return JSON.parse(cleanJsonString(rawJson));
  } catch (err) {
    throw new Error(
      `Failed to parse JSON for ${context}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
