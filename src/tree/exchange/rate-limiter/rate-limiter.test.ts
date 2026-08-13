import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter } from './index';
import type { EndpointCategory } from './index';

describe('RateLimiter', () => {
  let rl: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    rl = new RateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('acquire', () => {
    it('resolves immediately when tokens available', async () => {
      await expect(
        rl.acquire('binance', 'api'),
      ).resolves.toBeDefined();
    });

    it('decrements tokens after acquire', async () => {
      await rl.acquire('binance', 'api');
      // Should still be allowed
      await expect(
        rl.acquire('binance', 'api'),
      ).resolves.toBeDefined();
    });
  });

  describe('tryAcquire', () => {
    it('allows when tokens available', () => {
      const result = rl.tryAcquire('binance', 'api');
      expect(result.allowed).toBe(true);
    });

    it('blocks when no tokens', () => {
      // Exhaust tokens
      for (let i = 0; i < 1200; i++) {
        rl.tryAcquire('binance', 'api');
      }

      const result = rl.tryAcquire('binance', 'api');
      expect(result.allowed).toBe(false);
      expect(result.waitMs).toBeGreaterThan(0);
    });
  });

  describe('canProceed', () => {
    it('returns true when tokens available', () => {
      expect(rl.canProceed('binance', 'api')).toBe(true);
    });

    it('returns false when exhausted', () => {
      for (let i = 0; i < 1200; i++) {
        rl.tryAcquire('binance', 'api');
      }
      expect(rl.canProceed('binance', 'api')).toBe(false);
    });
  });

  describe('multiple exchanges', () => {
    it('tracks limits separately per exchange', () => {
      rl.tryAcquire('binance', 'api');
      rl.tryAcquire('binance', 'api');

      // Bybit has different limits
      expect(rl.canProceed('bybit', 'api')).toBe(true);
    });

    it('tracks limits separately per category', () => {
      // Exhaust API limit
      for (let i = 0; i < 1200; i++) {
        rl.tryAcquire('binance', 'api');
      }

      // Order limit is separate
      expect(rl.canProceed('binance', 'order')).toBe(true);
    });
  });

  describe('reset', () => {
    it('resets specific exchange+category', () => {
      for (let i = 0; i < 1200; i++) {
        rl.tryAcquire('binance', 'api');
      }
      expect(rl.canProceed('binance', 'api')).toBe(false);

      rl.reset('binance', 'api');
      expect(rl.canProceed('binance', 'api')).toBe(true);
    });

    it('resets all when no args', () => {
      for (let i = 0; i < 1200; i++) {
        rl.tryAcquire('binance', 'api');
      }
      for (let i = 0; i < 120; i++) {
        rl.tryAcquire('bybit', 'api');
      }

      rl.reset();
      expect(rl.canProceed('binance', 'api')).toBe(true);
      expect(rl.canProceed('bybit', 'api')).toBe(true);
    });
  });

  describe('reportBackoff', () => {
    it('sets backoff state', () => {
      rl.reportBackoff('binance', 'api', 1000);

      const result = rl.tryAcquire('binance', 'api');
      expect(result.allowed).toBe(false);
    });

    it('backoff expires after delay', () => {
      rl.reportBackoff('binance', 'api', 1000);

      vi.advanceTimersByTime(1100);

      const result = rl.tryAcquire('binance', 'api');
      expect(result.allowed).toBe(true);
    });
  });
});
