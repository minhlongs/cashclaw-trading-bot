// Reusable JSON serializer for D1 columns.
// D1 stores returned rows with BigInt IDs and Date objects that JSON.stringify rejects.
// Use this for any handler writing JSON into D1 JSON/TEXT columns.

export function serializeDetail(value: unknown): string {
  const seen = new Set<unknown>();
  const walk = (input: unknown): unknown => {
    if (input === null || typeof input !== 'object') {
      if (typeof input === 'bigint') return input.toString();
      return input;
    }

    if (seen.has(input)) return '[Circular]';
    seen.add(input);

    if (Array.isArray(input)) {
      return input.map(walk);
    }

    if (input instanceof Date) {
      return input.toISOString();
    }

    const out: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(input as object)) {
      const raw = (input as Record<string, unknown>)[key as string];
      if (raw === undefined) continue;
      out[typeof key === 'symbol' ? key.toString() : key] = walk(raw);
    }
    return out;
  };

  return JSON.stringify(walk(value));
}