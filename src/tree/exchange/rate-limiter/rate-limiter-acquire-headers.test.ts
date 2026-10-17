import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from './index';
import {
  RateLimitError,
  RateLimitExecutionTimeout,
  RateLimitQueueFull,
  RateLimitQueueWedged,
  getErrorBrand,
} from './errors';

describe('RateLimiter — acquire, error brands, headers & wedge watchdog', () => {
  let rl: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    rl = new RateLimiter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('acquire — legacy & timeoutMs paths', () => {
    it('waits and resolves when tokens are empty', async () => {
      for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'order');
      expect(rl.tryAcquire('okx', 'order').allowed).toBe(false);

      const promise = rl.acquire('okx', 'order');
      vi.advanceTimersByTime(200);
      const waitMs = await promise;
      expect(waitMs).toBeGreaterThanOrEqual(0);
    });

    it('returns 0 immediately when tokens are available (with and without timeoutMs)', async () => {
      expect(await rl.acquire('okx', 'order')).toBe(0);
      expect(await rl.acquire('okx', 'api', 1000)).toBe(0);
    });

    it('rejects with RateLimitExecutionTimeout when timeout fires first', async () => {
      for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'api');
      expect(rl.tryAcquire('okx', 'api').allowed).toBe(false);

      const promise = rl.acquire('okx', 'api', 100);
      vi.advanceTimersByTime(100);
      await expect(promise).rejects.toThrow('timed out after 100ms');
    });

    it('covers the wait path when tokens exhausted with zero or active backoff', async () => {
      for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'api');
      const p1 = rl.acquire('okx', 'api');
      vi.advanceTimersByTime(200);
      expect(await p1).toBeGreaterThanOrEqual(0);

      rl.recordBackoff('okx', 'api', 2);
      for (let i = 0; i < 20; i++) rl.tryAcquire('okx', 'api');
      const p2 = rl.acquire('okx', 'api');
      vi.advanceTimersByTime(2200);
      expect(await p2).toBeGreaterThanOrEqual(0);
    });
  });

  describe('RateLimitError branded types', () => {
    it('constructs RateLimitError and subclasses with expected code and retryAfterMs', () => {
      const err = new RateLimitError('test', 'TEST_CODE', 1234);
      expect(err.message).toBe('test');
      expect(err.code).toBe('TEST_CODE');
      expect(err.retryAfterMs).toBe(1234);
      expect(err.name).toBe('RateLimitError');

      const t = new RateLimitExecutionTimeout('timeout', 5000);
      const f = new RateLimitQueueFull('full', 3000);
      const w = new RateLimitQueueWedged('wedged', 2000);
      expect(t.code).toBe('RATE_LIMIT_EXECUTION_TIMEOUT');
      expect(f.code).toBe('RATE_LIMIT_QUEUE_FULL');
      expect(w.code).toBe('RATE_LIMIT_QUEUE_WEDGED');
      expect(getErrorBrand(t)).toBe('RATE_LIMIT_EXECUTION_TIMEOUT');
      expect(getErrorBrand(f)).toBe('RATE_LIMIT_QUEUE_FULL');
      expect(getErrorBrand(w)).toBe('RATE_LIMIT_QUEUE_WEDGED');
    });

    it('getErrorBrand returns undefined for non-branded errors', () => {
      expect(getErrorBrand(new Error('plain'))).toBeUndefined();
      expect(getErrorBrand(new RateLimitError('base', 'BASE', 100))).toBeUndefined();
    });
  });

  describe('updateFromHeaders + wedge watchdog', () => {
    it('parses remaining/reset headers and overwrites the bucket', () => {
      const atSeconds = Math.floor(Date.now() / 1000);
      const headers = new Headers({
        'x-ratelimit-remaining': '5',
        'x-ratelimit-reset': String(atSeconds),
        'x-ratelimit-limit': '10',
      });
      rl.updateFromHeaders('okx', 'api', headers);

      for (let i = 0; i < 5; i++) {
        expect(rl.tryAcquire('okx', 'api').allowed).toBe(true);
      }
      expect(rl.tryAcquire('okx', 'api').allowed).toBe(false);
    });

    it('handles missing rate-limit headers, retry-after fallback, and x-mbx-used-weight', () => {
      expect(() => rl.updateFromHeaders('okx', 'api', new Headers({ 'content-type': 'application/json' }))).not.toThrow();
      expect(rl.canProceed('okx', 'api')).toBe(true);

      expect(() => rl.updateFromHeaders('binance', 'api', new Headers({ 'retry-after': '3' }))).not.toThrow();

      rl.updateFromHeaders(
        'binance',
        'api',
        new Headers({ 'x-mbx-used-weight': '40', 'x-ratelimit-limit': '100' }),
      );
      expect(rl.tryAcquire('binance', 'api').allowed).toBe(true);
    });

    it('initWedgeWatchdog is idempotent and clears buckets after sustained inactivity', () => {
      const onWedge = vi.fn();
      rl.initWedgeWatchdog(onWedge);
      rl.initWedgeWatchdog(onWedge);
      expect(onWedge).not.toHaveBeenCalled();

      rl.tryAcquire('okx', 'api');
      rl.recordBackoff('okx', 'api', 5);
      vi.advanceTimersByTime(90_000);
      expect(onWedge).toHaveBeenCalledTimes(1);
      expect(rl.getBackoff('okx', 'api')).toBe(0);
    });
  });
});
