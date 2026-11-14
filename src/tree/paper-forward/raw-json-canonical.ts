// Gate G13: Lossless Raw JSON Sorted-Key Canonicalizer (Preserves Exact Python Numeric Lexemes).

interface RawCursor {
  readonly src: string;
  idx: number;
}

function skipWs(c: RawCursor): void {
  while (c.idx < c.src.length && /\s/.test(c.src.charAt(c.idx))) c.idx += 1;
}

function compareAsciiKeys(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function readJsonStringToken(c: RawCursor): { raw: string; decoded: string } {
  const start = c.idx;
  c.idx += 1;
  while (c.idx < c.src.length) {
    const ch = c.src[c.idx];
    if (ch === '\\') c.idx += 2;
    else if (ch === '"') {
      c.idx += 1;
      const raw = c.src.slice(start, c.idx);
      return { raw, decoded: JSON.parse(raw) as string };
    } else c.idx += 1;
  }
  throw new Error('Unterminated JSON string');
}

function parseRawArrayCanonical(c: RawCursor): string {
  c.idx += 1;
  skipWs(c);
  const items: string[] = [];
  while (c.idx < c.src.length && c.src[c.idx] !== ']') {
    items.push(parseRawValueCanonical(c));
    skipWs(c);
    if (c.src[c.idx] === ',') c.idx += 1;
    else break;
  }
  if (c.src[c.idx] !== ']') throw new Error('Expected ]');
  c.idx += 1;
  return `[${items.join(',')}]`;
}

function parseRawObjectCanonical(c: RawCursor, excludeRootKey?: string): string {
  c.idx += 1;
  skipWs(c);
  const seenKeys = new Set<string>();
  const entries: Array<{ key: string; val: string }> = [];
  while (c.idx < c.src.length && c.src[c.idx] !== '}') {
    skipWs(c);
    const keyTok = readJsonStringToken(c);
    if (keyTok.decoded === '__proto__') {
      throw new Error('Forbidden __proto__ JSON key');
    }
    if (seenKeys.has(keyTok.decoded)) {
      throw new Error(`Duplicate JSON key forbidden: ${keyTok.decoded}`);
    }
    seenKeys.add(keyTok.decoded);
    skipWs(c);
    if (c.src[c.idx] !== ':') throw new Error('Expected :');
    c.idx += 1;
    const val = parseRawValueCanonical(c);
    if (keyTok.decoded !== excludeRootKey) entries.push({ key: keyTok.decoded, val });
    skipWs(c);
    if (c.src[c.idx] === ',') c.idx += 1;
    else break;
  }
  if (c.src[c.idx] !== '}') throw new Error('Expected }');
  c.idx += 1;
  entries.sort((a, b) => compareAsciiKeys(a.key, b.key));
  return `{${entries.map((e) => `${JSON.stringify(e.key)}:${e.val}`).join(',')}}`;
}

function parseRawValueCanonical(c: RawCursor, excludeRootKey?: string): string {
  skipWs(c);
  const ch = c.src[c.idx];
  if (ch === '"') return JSON.stringify(readJsonStringToken(c).decoded);
  if (ch === '[') return parseRawArrayCanonical(c);
  if (ch === '{') return parseRawObjectCanonical(c, excludeRootKey);
  const start = c.idx;
  while (c.idx < c.src.length && !/[\s,\]}]/.test(c.src.charAt(c.idx))) c.idx += 1;
  return c.src.slice(start, c.idx);
}

export function canonicalizeRawJsonPayload(rawJson: string, excludeRootKey: string): string {
  const cursor: RawCursor = { src: rawJson, idx: 0 };
  const result = parseRawValueCanonical(cursor, excludeRootKey);
  skipWs(cursor);
  if (cursor.idx !== rawJson.length) throw new Error('Trailing characters after JSON root');
  return result;
}
