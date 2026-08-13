import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit, getRateLimitHeaders } from './rate-limiter';

describe('rate-limiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkRateLimit', () => {
    it('allows first request', () => {
      const result = checkRateLimit('test-key');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
    });

    it('tracks request count', () => {
      checkRateLimit('test-key');
      checkRateLimit('test-key');
      const result = checkRateLimit('test-key');
      expect(result.remaining).toBe(97);
    });

    it('blocks when limit exceeded', () => {
      for (let i = 0; i < 100; i++) {
        checkRateLimit('test-key');
      }
      const result = checkRateLimit('test-key');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('resets after window expires', () => {
      for (let i = 0; i < 100; i++) {
        checkRateLimit('test-key');
      }

      vi.advanceTimersByTime(61000);

      const result = checkRateLimit('test-key');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
    });

    it('tracks different keys separately', () => {
      checkRateLimit('key-1');
      checkRateLimit('key-1');
      checkRateLimit('key-2');

      const result1 = checkRateLimit('key-1');
      expect(result1.remaining).toBe(98);

      const result2 = checkRateLimit('key-2');
      expect(result2.remaining).toBe(99);
    });
  });

  describe('getRateLimitHeaders', () => {
    it('returns correct headers', () => {
      const result = checkRateLimit('test-key');
      const headers = getRateLimitHeaders(result);

      expect(headers['X-RateLimit-Limit']).toBe('100');
      expect(headers['X-RateLimit-Remaining']).toBe('99');
      expect(headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('returns zero remaining when limit hit', () => {
      for (let i = 0; i < 100; i++) {
        checkRateLimit('test-key');
      }
      const result = checkRateLimit('test-key');
      const headers = getRateLimitHeaders(result);

      expect(headers['X-RateLimit-Remaining']).toBe('0');
    });
  });
});
