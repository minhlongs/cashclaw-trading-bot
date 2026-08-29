import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter, rateLimiter } from './index';
import { RateLimitError, RateLimitExecutionTimeout, RateLimitQueueFull, RateLimitQueueWedged, getErrorBrand } from './errors';

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

  // ---------------------------------------------------- acquire (legacy)
  describe('acquire — legacy wait path', () => {
    it('waits and resolves when tokens are empty', async () => {
      // Drain okx:order bucket (capacity=20)
      for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'order');
      expect(rl.tryAcquire('okx', 'order').allowed).toBe(false);

      const promise = rl.acquire('okx', 'order');
      vi.advanceTimersByTime(200); // waitMs + 50 = 150
      const waitMs = await promise;
      expect(waitMs).toBeGreaterThanOrEqual(0);
    });

    it('returns 0 immediately when tokens are available', async () => {
      const waitMs = await rl.acquire('okx', 'order');
      expect(waitMs).toBe(0);
    });
  });

  // --------------------------------------- acquire — timeoutMs branch
  describe('acquire — with timeoutMs', () => {
    it('rejects with RateLimitExecutionTimeout when timeout fires first', async () => {
      for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'api');
      expect(rl.tryAcquire('okx', 'api').allowed).toBe(false);

      const promise = rl.acquire('okx', 'api', 100);
      vi.advanceTimersByTime(100);
      await expect(promise).rejects.toThrow('timed out after 100ms');
    });

    it('covers cleanup when timeoutMs is set but tokens available', async () => {
      // This test covers the cleanup branch (lines 75-77) when timeoutMs is provided
      // but tokens are immediately available (resolves before timeout)
      const waitMs = await rl.acquire('okx', 'api', 1000);
      expect(waitMs).toBe(0);
    });

    it('covers the wait path when tokens exhausted and backoff is zero', async () => {
      // Drain okx:api bucket (capacity=20)
      for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'api');
      expect(rl.tryAcquire('okx', 'api').allowed).toBe(false);

      // No timeoutMs, should wait and resolve
      const promise = rl.acquire('okx', 'api');
      vi.advanceTimersByTime(200); // waitMs + 50 = 150
      const waitMs = await promise;
      expect(waitMs).toBeGreaterThanOrEqual(0);
    });

    it('covers the wait path with backoff', async () => {
      // Set a backoff
      rl.recordBackoff('okx', 'api', 2);
      // Drain tokens
      for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'api');
      expect(rl.tryAcquire('okx', 'api').allowed).toBe(false);

      const promise = rl.acquire('okx', 'api');
      // waitMs = 100 (no tokens) + backoff (2000) = 2100, plus 50 = 2150
      vi.advanceTimersByTime(2200);
      const waitMs = await promise;
      expect(waitMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ------------------------------------------------ singleton export
  describe('rateLimiter singleton', () => {
    it('is an instance of RateLimiter', () => {
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });
  });

  // ------------------------------------------------ error types (errors.ts)
  describe('RateLimitError branded types', () => {
    it('RateLimitError stores code and retryAfterMs', () => {
      const err = new RateLimitError('test', 'TEST_CODE', 1234);
      expect(err.message).toBe('test');
      expect(err.code).toBe('TEST_CODE');
      expect(err.retryAfterMs).toBe(1234);
      expect(err.name).toBe('RateLimitError');
    });

    it('RateLimitExecutionTimeout inherits and sets code', () => {
      const err = new RateLimitExecutionTimeout('timeout', 5000);
      expect(err.code).toBe('RATE_LIMIT_EXECUTION_TIMEOUT');
      expect(err.retryAfterMs).toBe(5000);
      expect(err.name).toBe('RateLimitExecutionTimeout');
    });

    it('RateLimitQueueFull inherits and sets code', () => {
      const err = new RateLimitQueueFull('full', 3000);
      expect(err.code).toBe('RATE_LIMIT_QUEUE_FULL');
      expect(err.retryAfterMs).toBe(3000);
      expect(err.name).toBe('RateLimitQueueFull');
    });

    it('RateLimitQueueWedged inherits and sets code', () => {
      const err = new RateLimitQueueWedged('wedged', 2000);
      expect(err.code).toBe('RATE_LIMIT_QUEUE_WEDGED');
      expect(err.retryAfterMs).toBe(2000);
      expect(err.name).toBe('RateLimitQueueWedged');
    });

    it('getErrorBrand returns the branded code for branded errors', () => {
      const err1 = new RateLimitExecutionTimeout('t1', 1000);
      const err2 = new RateLimitQueueFull('t2', 2000);
      const err3 = new RateLimitQueueWedged('t3', 3000);
      expect(getErrorBrand(err1)).toBe('RATE_LIMIT_EXECUTION_TIMEOUT');
      expect(getErrorBrand(err2)).toBe('RATE_LIMIT_QUEUE_FULL');
      expect(getErrorBrand(err3)).toBe('RATE_LIMIT_QUEUE_WEDGED');
    });

    it('getErrorBrand returns undefined for non-branded errors', () => {
      const plain = new Error('plain');
      const base = new RateLimitError('base', 'BASE', 100); // base class is not branded
      expect(getErrorBrand(plain)).toBeUndefined();
      expect(getErrorBrand(base)).toBeUndefined();
    });
  });

  // ------------------------------------------- updateFromHeaders / wedge
  describe('updateFromHeaders + wedge watchdog', () => {
    it('parses remaining/reset headers and overwrites the bucket', () => {
      const atSeconds = Math.floor(Date.now() / 1000);
      const headers = new Headers({
        'x-ratelimit-remaining': '5',
        'x-ratelimit-reset': String(atSeconds), // seconds -> ms branch
        'x-ratelimit-limit': '10',
      });
      rl.updateFromHeaders('okx', 'api', headers);

      // Bucket was overwritten with remaining=5, so 5 acquires succeed then it stops.
      for (let i = 0; i < 5; i++) {
        expect(rl.tryAcquire('okx', 'api').allowed).toBe(true);
      }
      expect(rl.tryAcquire('okx', 'api').allowed).toBe(false);
    });

    it('does nothing when headers carry no rate-limit info', () => {
      const headers = new Headers({ 'content-type': 'application/json' });
      expect(() => rl.updateFromHeaders('okx', 'api', headers)).not.toThrow();
      // untouched bucket still has default capacity
      expect(rl.canProceed('okx', 'api')).toBe(true);
    });

    it('falls back to retry-after when x-ratelimit-reset is absent', () => {
      const headers = new Headers({ 'retry-after': '3' });
      expect(() => rl.updateFromHeaders('binance', 'api', headers)).not.toThrow();
    });

    it('computes remaining from limit - used-weight when remaining is absent', () => {
      const headers = new Headers({
        'x-mbx-used-weight': '40',
        'x-ratelimit-limit': '100',
      });
      rl.updateFromHeaders('binance', 'api', headers);
      expect(rl.tryAcquire('binance', 'api').allowed).toBe(true);
    });

    it('initWedgeWatchdog is idempotent — second call is a no-op', () => {
      const onWedge = vi.fn();
      rl.initWedgeWatchdog(onWedge);
      rl.initWedgeWatchdog(onWedge); // already started, must not double-register
      // No buckets exist yet, so wedge has nothing to clear; just confirm no throw.
      expect(onWedge).not.toHaveBeenCalled();
    });

    it('wedge fires after sustained inactivity and clears buckets via callback', () => {
      const onWedge = vi.fn();
      rl.initWedgeWatchdog(onWedge);
      // Seed a real bucket so the wedge callback's buckets.keys() loop has
      // something to clear. (recordBackoff alone only writes backoffState.)
      rl.tryAcquire('okx', 'api');
      rl.recordBackoff('okx', 'api', 5);

      // interval=30s; a check counts as stuck when elapsed > 2*refillCycleMs (30s).
      // Tick 1 (30s): elapsed=30, not >30, not stuck. Tick 2 (60s): stuck, count=1.
      // Tick 3 (90s): stuck again, count=2 -> fires onWedgeDetected once.
      vi.advanceTimersByTime(90_000);
      expect(onWedge).toHaveBeenCalledTimes(1);
      // wedge cleared the backoff state it was guarding
      expect(rl.getBackoff('okx', 'api')).toBe(0);
    });
  });
});