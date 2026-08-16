import { describe, it, expect } from 'vitest';
import { parseRateLimitHeaders } from './headers';

function makeHeaders(obj: Record<string, string>): Headers {
  return new Headers(obj);
}

describe('parseRateLimitHeaders', () => {
  it('parses Binance x-ratelimit-remaining + x-ratelimit-reset', () => {
    const h = makeHeaders({
      'x-ratelimit-remaining': '1190',
      'x-ratelimit-reset': '1695000060', // epoch seconds
    });
    const result = parseRateLimitHeaders(h);
    expect(result).toEqual({
      remaining: 1190,
      resetAt: 1695000060 * 1000,
      limit: 0,
    });
  });

  it('parses standard x-ratelimit-remaining + x-ratelimit-limit', () => {
    const h = makeHeaders({
      'x-ratelimit-remaining': '15',
      'x-ratelimit-limit': '20',
    });
    const result = parseRateLimitHeaders(h);
    expect(result).toEqual({
      remaining: 15,
      resetAt: expect.any(Number),
      limit: 20,
    });
  });

  it('parses Binance x-mbx-used-weight-x (derives remaining)', () => {
    const h = makeHeaders({
      'x-mbx-used-weight-x': '100',
      'x-ratelimit-limit': '2400',
      'x-ratelimit-reset': '1695000100',
    });
    const result = parseRateLimitHeaders(h);
    expect(result).toEqual({
      remaining: 2300,
      resetAt: 1695000100 * 1000,
      limit: 2400,
    });
  });

  it('parses retry-after header', () => {
    const before = Date.now();
    const h = makeHeaders({ 'retry-after': '5' });
    const result = parseRateLimitHeaders(h);
    expect(result).not.toBeNull();
    expect(result!.resetAt).toBeGreaterThanOrEqual(before + 5000);
    expect(result!.resetAt).toBeLessThanOrEqual(before + 5500);
  });

  it('returns null when no recognizable headers present', () => {
    const h = makeHeaders({ 'content-type': 'application/json' });
    expect(parseRateLimitHeaders(h)).toBeNull();
  });

  it('returns null when all header values are non-numeric', () => {
    const h = makeHeaders({
      'x-ratelimit-remaining': 'abc',
      'x-ratelimit-reset': 'xyz',
    });
    expect(parseRateLimitHeaders(h)).toBeNull();
  });

  it('handles x-mbx-used-weight fallback (without -x suffix)', () => {
    const h = makeHeaders({
      'x-mbx-used-weight': '50',
      'x-ratelimit-limit': '100',
    });
    const result = parseRateLimitHeaders(h);
    expect(result).toEqual({
      remaining: 50,
      resetAt: expect.any(Number),
      limit: 100,
    });
  });
});
