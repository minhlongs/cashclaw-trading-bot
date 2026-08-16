/**
 * Deterministic JSON serialization for hash-chain audit entries.
 * Produces a stable string regardless of key insertion order or
 * runtime-specific JSON quirks.
 */

const CIRCULAR = '[Circular]';

function build(value: unknown, seen: Set<object>): unknown {
  if (value === undefined) {
    return undefined;
  }

  // BigInt → string (must check before generic primitive pass-through)
  if (typeof value === 'bigint') {
    return value.toString();
  }

  // Symbol → "Symbol(name)" (must check before generic primitive pass-through)
  if (typeof value === 'symbol') {
    return value.toString();
  }

  // null, numbers, strings, booleans — pass through
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Date → ISO string
  if (value instanceof Date) {
    return value.toISOString();
  }

  // toJSON() support (e.g. custom serialization on Date-like types)
  if (typeof (value as Record<string, unknown>).toJSON === 'function') {
    return build((value as { toJSON(): unknown }).toJSON(), seen);
  }

  // Circular reference detection
  if (seen.has(value as object)) {
    return CIRCULAR;
  }
  seen.add(value as object);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => build(item, seen));
    }

    // Plain object: collect both string and symbol keys, sort alphabetically, recurse values
    const entries: [string, unknown][] = [];

    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      entries.push([key, build(val, seen)]);
    }
    for (const sym of Object.getOwnPropertySymbols(value as object)) {
      entries.push([sym.toString(), build((value as Record<symbol, unknown>)[sym], seen)]);
    }

    entries.sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries);
  } finally {
    seen.delete(value as object);
  }
}

export function canonicalize(value: unknown): string {
  const seen = new Set<object>();
  const result = build(value, seen);
  const cleaned = cleanUndefined(result);
  return JSON.stringify(cleaned);
}

/**
 * Remove any remaining undefined values (from explicit { k: undefined })
 * that JSON.stringify would drop anyway. We strip them explicitly so the
 * recursive sort + stringify path stays clean.
 */
function cleanUndefined(value: unknown): unknown {
  if (value === undefined || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(cleanUndefined);
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) {
      result[k] = cleanUndefined(v);
    }
  }
  return result;
}