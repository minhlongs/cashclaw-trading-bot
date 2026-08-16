import { describe, it, expect } from 'vitest';
import { serializeDetail } from './serialize-detail';

describe('serializeDetail', () => {
  it('serializes plain objects', () => {
    expect(serializeDetail({ a: 1, b: 'hello' })).toBe('{"a":1,"b":"hello"}');
  });

  it('converts BigInt to string', () => {
    const input = { id: BigInt(1234567890123456) };
    const result = JSON.parse(serializeDetail(input));
    expect(result.id).toBe('1234567890123456');
  });

  it('converts Date to ISO string', () => {
    const date = new Date('2026-08-16T10:00:00.000Z');
    const result = JSON.parse(serializeDetail({ ts: date }));
    expect(result.ts).toBe('2026-08-16T10:00:00.000Z');
  });

  it('handles nested objects with BigInt', () => {
    const input = {
      trade: { id: BigInt(42), amount: 0.5 },
      meta: { nested: true },
    };
    const result = JSON.parse(serializeDetail(input));
    expect(result.trade.id).toBe('42');
    expect(result.trade.amount).toBe(0.5);
    expect(result.meta.nested).toBe(true);
  });

  it('handles arrays with BigInt values', () => {
    const input = [BigInt(1), BigInt(2), 3];
    const result = JSON.parse(serializeDetail(input));
    expect(result).toEqual(['1', '2', 3]);
  });

  it('detects circular references', () => {
    const input: Record<string, unknown> = { a: 1 };
    input.self = input;
    const result = JSON.parse(serializeDetail(input));
    expect(result.a).toBe(1);
    expect(result.self).toBe('[Circular]');
  });

  it('skips undefined values', () => {
    const input = { a: 1, b: undefined, c: 3 };
    const result = JSON.parse(serializeDetail(input));
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('handles null values', () => {
    const result = JSON.parse(serializeDetail({ x: null }));
    expect(result.x).toBeNull();
  });

  it('handles symbol keys by converting to string', () => {
    const sym = Symbol('test');
    const input = { [sym]: 'value', normal: 1 };
    const result = JSON.parse(serializeDetail(input));
    expect(result.normal).toBe(1);
    expect(result['Symbol(test)']).toBe('value');
  });

  it('handles empty objects and arrays', () => {
    expect(serializeDetail({})).toBe('{}');
    expect(serializeDetail([])).toBe('[]');
  });
});
