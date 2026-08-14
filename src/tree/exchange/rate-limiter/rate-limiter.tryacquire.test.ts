import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from './index';

/*
 * DEFAULT_LIMITS referenced:
 *   okx:api — capacity: 20, refillMs: 2000
 */

describe('RateLimiter — tryAcquire', () => {
  let rl: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    rl = new RateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns allowed=true for fresh bucket with tokens available', () => {
    const result = rl.tryAcquire('okx', 'api');
    expect(result).toEqual({ allowed: true });
  });

  it('consumes exactly one token per call', () => {
    for (let i = 0; i < 20; i++) {
      expect(rl.tryAcquire('okx', 'api').allowed).toBe(true);
    }
    expect(rl.tryAcquire('okx', 'api').allowed).toBe(false);
  });

  it('returns allowed=false with waitMs when capacity exhausted', () => {
    for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'api');

    const result = rl.tryAcquire('okx', 'api');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.waitMs).toBeGreaterThanOrEqual(50);
    }
  });

  it('returns waitMs based on backoff when backoff active', () => {
    rl.recordBackoff('okx', 'api', 2);

    const result = rl.tryAcquire('okx', 'api');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.waitMs).toBeGreaterThan(100);
    }
  });

  it('tokens refill after refillMs elapses (lazy refill)', () => {
    for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'api');
    expect(rl.tryAcquire('okx', 'api').allowed).toBe(false);

    vi.advanceTimersByTime(2000);
    expect(rl.tryAcquire('okx', 'api').allowed).toBe(true);
  });

  it('refill uses integer cycles — fractional cycle gives no tokens', () => {
    for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'api');

    // floor(1000/2000) = 0 refills
    vi.advanceTimersByTime(1000);
    expect(rl.tryAcquire('okx', 'api').allowed).toBe(false);
  });

  it('1.5 refill cycles gives exactly one full refill of tokens', () => {
    for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'api');

    // floor(3000/2000) = 1 refill = +20 tokens
    vi.advanceTimersByTime(3000);
    let count = 0;
    while (rl.tryAcquire('okx', 'api').allowed) count++;
    expect(count).toBe(20);
  });

  it('tokens never exceed capacity', () => {
    for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'api');

    vi.advanceTimersByTime(2000 * 5);
    let count = 0;
    while (rl.tryAcquire('okx', 'api').allowed) count++;
    expect(count).toBeLessThanOrEqual(20);
  });

  it('backoff blocks even when tokens are available', () => {
    rl.recordBackoff('okx', 'api', 2);

    const result = rl.tryAcquire('okx', 'api');
    expect(result.allowed).toBe(false);
  });

  it('backoff expiry restores access', () => {
    rl.recordBackoff('okx', 'api', 2);

    vi.advanceTimersByTime(1900);
    expect(rl.tryAcquire('okx', 'api').allowed).toBe(false);

    vi.advanceTimersByTime(200);
    expect(rl.tryAcquire('okx', 'api').allowed).toBe(true);
  });

  it('returns correct waitMs aligned to refill cycle', () => {
    for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'api');

    const result = rl.tryAcquire('okx', 'api');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.waitMs).toBeGreaterThanOrEqual(50);
    }
  });
});
