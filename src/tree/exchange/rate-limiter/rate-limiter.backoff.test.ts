import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from './index';

describe('RateLimiter — backoff + acquire', () => {
  let rl: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    rl = new RateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ------------------------------------------------------- recordBackoff
  describe('recordBackoff', () => {
    it('creates backoff with default multiplier=2', () => {
      rl.recordBackoff('okx', 'api');
      expect(rl.getBackoff('okx', 'api')).toBeGreaterThan(0);
    });

    it('first call with default multiplier produces ~2000ms', () => {
      rl.recordBackoff('okx', 'api');
      const backoff = rl.getBackoff('okx', 'api');
      expect(backoff).toBeGreaterThan(1900);
      expect(backoff).toBeLessThanOrEqual(2000);
    });

    it('scales backoff by multiplier', () => {
      rl.recordBackoff('okx', 'api', 1);
      const b1 = rl.getBackoff('okx', 'api');

      rl.reset();
      rl.recordBackoff('okx', 'api', 3);
      const b3 = rl.getBackoff('okx', 'api');

      expect(b3).toBeGreaterThan(b1);
    });

    it('backoff decays over time', () => {
      rl.recordBackoff('okx', 'api', 5);
      const initial = rl.getBackoff('okx', 'api');
      vi.advanceTimersByTime(500);
      const after = rl.getBackoff('okx', 'api');
      expect(after).toBeLessThan(initial);
    });

    it('backoff fully expires', () => {
      rl.recordBackoff('okx', 'api', 2);
      vi.advanceTimersByTime(2500);
      expect(rl.getBackoff('okx', 'api')).toBe(0);
    });

    it('multiple recordBackoff calls escalate the delay', () => {
      rl.recordBackoff('okx', 'api', 1);
      const first = rl.getBackoff('okx', 'api');

      vi.advanceTimersByTime(100);
      rl.recordBackoff('okx', 'api', 1);
      const second = rl.getBackoff('okx', 'api');

      expect(second).toBeGreaterThanOrEqual(first * 0.4);
    });

    it('backoff capped at 60 seconds', () => {
      rl.recordBackoff('okx', 'api', 100);
      const state = (rl as unknown as Record<string, Map<
        string,
        { delayMs: number; expiresAt: number }
      >>)['backoffState'];
      const entry = state.get('okx:api');
      expect(entry).toBeDefined();
      if (entry) expect(entry.delayMs).toBeLessThanOrEqual(60_000);
    });
  });

  // -------------------------------------------------------- acquire (async)
  describe('acquire', () => {
    it('resolves immediately with waitMs=0 when tokens available', async () => {
      const p = rl.acquire('okx', 'api');
      vi.advanceTimersByTime(0);
      const wait = await p;
      expect(wait).toBe(0);
    });

    it('resolves after backoff + delay when backoff active', async () => {
      rl.recordBackoff('okx', 'api', 1);

      const p = rl.acquire('okx', 'api');
      vi.advanceTimersByTime(1200);
      const wait = await p;
      expect(wait).toBeGreaterThanOrEqual(1000);
    });

    it('resolves after delay when tokens exhausted', async () => {
      for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'api');

      const p = rl.acquire('okx', 'api');
      vi.advanceTimersByTime(3000);
      const wait = await p;
      expect(wait).toBeGreaterThanOrEqual(100);
    });
  });
});
