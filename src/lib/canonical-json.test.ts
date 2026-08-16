import { describe, it, expect } from 'vitest';
import { canonicalize } from './canonical-json';

describe('canonicalize', () => {
  // 1. Plain object → sorted keys
  it('sorts keys alphabetically for a plain object', () => {
    const input = { z: 1, a: 2, m: 3 };
    const result = canonicalize(input);
    expect(result).toBe('{"a":2,"m":3,"z":1}');
  });

  // 2. Nested object → recursive sort
  it('recursively sorts keys in nested objects', () => {
    const input = { outer: { z: 1, a: 2 }, inner: { b: 3, a: 4 } };
    expect(canonicalize(input)).toBe('{"inner":{"a":4,"b":3},"outer":{"a":2,"z":1}}');
  });

  // 3. BigInt → stringified
  it('converts BigInt values to strings', () => {
    const input = { amount: BigInt(123) };
    expect(canonicalize(input)).toBe('{"amount":"123"}');
  });

  // 4. Date → ISO string
  it('converts Date instances to ISO strings', () => {
    const date = new Date('2025-01-02T03:04:05.000Z');
    const input = { ts: date };
    expect(canonicalize(input)).toBe('{"ts":"2025-01-02T03:04:05.000Z"}');
  });

  // 5. Symbol key → string representation
  it('converts symbol keys to their string representation', () => {
    const sym = Symbol('mySymbol');
    const input = { [sym]: 42 } as Record<symbol, number>;
    const result = canonicalize(input);
    expect(result).toBe('{"Symbol(mySymbol)":42}');
  });

  // 6. Undefined → skipped (not present in output)
  it('omits keys with undefined values', () => {
    const input = { keep: 1, drop: undefined };
    const result = canonicalize(input);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ keep: 1 });
    expect(parsed).not.toHaveProperty('drop');
  });

  // 7. Circular ref → "[Circular]"
  it('replaces circular references with "[Circular]"', () => {
    const input: Record<string, unknown> = { a: 1 };
    input.self = input;
    const result = canonicalize(input);
    expect(result).toBe('{"a":1,"self":"[Circular]"}');
  });

  // 8. Array → elements processed
  it('processes array elements recursively and preserves order', () => {
    const input = [{ z: 1, a: 2 }, 'skip', null];
    expect(canonicalize(input)).toBe('[{"a":2,"z":1},"skip",null]');
  });

  // 9. Same input twice → same output (determinism)
  it('produces identical output for the same input on repeated calls', () => {
    const input = { b: BigInt(2), a: new Date('2025-01-01T00:00:00Z'), c: { z: 1, a: 2 } };
    const first = canonicalize(input);
    const second = canonicalize(input);
    expect(first).toBe(second);
  });

  // 10. Null / primitives → passthrough
  it('passes through null, numbers, strings, and booleans unchanged', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(0)).toBe('0');
    expect(canonicalize('hello')).toBe('"hello"');
    expect(canonicalize(true)).toBe('true');
  });
});