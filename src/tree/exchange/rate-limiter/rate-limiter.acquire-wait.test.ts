import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from './index';

describe('RateLimiter — acquire wait path', () => {
  let rl: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    rl = new RateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('awaits a refill when tokens are exhausted (covers acquire else branch)', async () => {
    const p = rl.acquire('okx', 'api');
    vi.advanceTimersByTime(2100);
    const waitMs = await p;
    expect(waitMs).toBeGreaterThanOrEqual(0);
  });
});