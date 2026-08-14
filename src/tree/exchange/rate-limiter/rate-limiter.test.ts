import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter, rateLimiter } from './index';

/*
 * DEFAULT_LIMITS referenced:
 *   okx:api   — capacity: 20,  refillMs: 2000
 *   okx:order — capacity: 20,  refillMs: 1000
 *   binance:api — capacity: 1200, refillMs: 60000
 *   unknown ex — capacity: 100, refillMs: 60000 (hardcoded default)
 */

describe('RateLimiter — budget, canProceed, reset, defaults', () => {
  let rl: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    rl = new RateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------- setBudget
  describe('setBudget', () => {
    it('affects getRemainingBudget output', () => {
      rl.setBudget('okx', 'api', 10, 600);
      const remaining = rl.getRemainingBudget('okx', 'api');
      expect(remaining).toBe(10);
    });

    it('getRemainingBudget returns min of tokens and budget', () => {
      rl.setBudget('okx', 'api', 5, 300);
      const remaining = rl.getRemainingBudget('okx', 'api');
      expect(remaining).toBe(5);
    });
  });

  // ------------------------------------------------- getRemainingBudget
  describe('getRemainingBudget', () => {
    it('returns 0 when no budget set (budgetMap empty)', () => {
      const remaining = rl.getRemainingBudget('okx', 'api');
      expect(remaining).toBe(0);
    });

    it('returns min(tokens, budget) after setBudget with budget cap', () => {
      // setBudget creates bucket with tokens=reqPerMin, budget=reqPerMin
      rl.setBudget('okx', 'api', 5, 300);
      // bucket has 5 tokens, budget=5
      expect(rl.getRemainingBudget('okx', 'api')).toBe(5);
    });

    it('returns 0 for unknown exchange when no budget and no bucket', () => {
      expect(rl.getRemainingBudget('nonexistent', 'api')).toBe(0);
    });

    it('budget cap limits the returned value', () => {
      rl.setBudget('okx', 'api', 3, 300);
      expect(rl.getRemainingBudget('okx', 'api')).toBe(3);
    });
  });

  // -------------------------------------------------------- canProceed
  describe('canProceed', () => {
    it('returns true when tokens available and no backoff', () => {
      expect(rl.canProceed('okx', 'api')).toBe(true);
    });

    it('returns false during active backoff', () => {
      rl.recordBackoff('okx', 'api', 3);
      expect(rl.canProceed('okx', 'api')).toBe(false);
    });

    it('returns true after backoff expires', () => {
      rl.recordBackoff('okx', 'api', 1);
      vi.advanceTimersByTime(1500);
      expect(rl.canProceed('okx', 'api')).toBe(true);
    });

    it('returns false when capacity exhausted and no refill yet', () => {
      for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'api');
      expect(rl.canProceed('okx', 'api')).toBe(false);
    });

    it('returns true after refill restores tokens', () => {
      for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'api');
      vi.advanceTimersByTime(2000);
      expect(rl.canProceed('okx', 'api')).toBe(true);
    });

    it('returns true for unknown exchange (default capacity=100)', () => {
      expect(rl.canProceed('unknown', 'api')).toBe(true);
    });
  });

  // ----------------------------------------------------------- reset
  describe('reset', () => {
    it('clears all state when called with no args', () => {
      rl.recordBackoff('okx', 'api');
      rl.recordBackoff('okx', 'order');
      rl.reset();

      expect(rl.getBackoff('okx', 'api')).toBe(0);
      expect(rl.canProceed('okx', 'api')).toBe(true);
    });

    it('clears only the targeted exchange:category', () => {
      rl.recordBackoff('okx', 'api', 5);
      rl.recordBackoff('okx', 'order', 5);
      rl.reset('okx', 'api');

      expect(rl.getBackoff('okx', 'api')).toBe(0);
      expect(rl.getBackoff('okx', 'order')).toBeGreaterThan(0);
    });

    it('clears all categories of a given exchange when category omitted', () => {
      rl.recordBackoff('binance', 'api', 5);
      rl.recordBackoff('binance', 'order', 5);
      rl.reset('binance');

      expect(rl.getBackoff('binance', 'api')).toBe(0);
      expect(rl.getBackoff('binance', 'order')).toBe(0);
    });
  });

  // ------------------------------------------------- DEFAULT_LIMITS init
  describe('DEFAULT_LIMITS initialization', () => {
    it('creates buckets for all known exchange:category pairs', () => {
      const fresh = new RateLimiter();
      const pairs: [string, 'api' | 'order' | 'ws'][] = [
        ['binance', 'api'],
        ['binance', 'order'],
        ['binance', 'ws'],
        ['bybit', 'api'],
        ['bybit', 'order'],
        ['bybit', 'ws'],
        ['okx', 'api'],
        ['okx', 'order'],
        ['okx', 'ws'],
      ];
      for (const [ex, cat] of pairs) {
        expect(fresh.canProceed(ex, cat)).toBe(true);
      }
    });

    it('binance:api has capacity 1200 — first 1200 acquires succeed', () => {
      const fresh = new RateLimiter();
      for (let i = 0; i < 1200; i++) {
        expect(fresh.tryAcquire('binance', 'api').allowed).toBe(true);
      }
      expect(fresh.tryAcquire('binance', 'api').allowed).toBe(false);
    });
  });

  // --------------------------------------------------- concurrency sim
  describe('concurrent access simulation', () => {
    it('sequential tryAcquire calls respect capacity', () => {
      const results = [];
      for (let i = 0; i < 20; i++) {
        results.push(rl.tryAcquire('okx', 'order'));
      }
      expect(results.every((r) => r.allowed)).toBe(true);
      expect(rl.tryAcquire('okx', 'order').allowed).toBe(false);
    });

    it('different exchanges have independent buckets', () => {
      for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'api');
      expect(rl.tryAcquire('okx', 'api').allowed).toBe(false);
      expect(rl.tryAcquire('okx', 'order').allowed).toBe(true);
    });
  });

  // ------------------------------------------------ singleton export
  describe('rateLimiter singleton', () => {
    it('is an instance of RateLimiter', () => {
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });
  });
});
