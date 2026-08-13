import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
      const result = checkRateLimit('rl-allow-first');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
    });

    it('rejects when limit exceeded', () => {
      for (let i = 0; i < 101; i++) {
        checkRateLimit('rl-reject-limit');
      }
      const result = checkRateLimit('rl-reject-limit');
      expect(result.allowed).toBe(false);
    });

    it('tracks request count', () => {
      checkRateLimit('rl-track-count');
      checkRateLimit('rl-track-count');
      const result = checkRateLimit('rl-track-count');

      expect(result.remaining).toBe(97);
    });

    it('tracks different keys separately', () => {
      checkRateLimit('rl-diff-key-1');
      checkRateLimit('rl-diff-key-1');
      checkRateLimit('rl-diff-key-1');

      checkRateLimit('rl-diff-key-2');
      checkRateLimit('rl-diff-key-2');

      const result1 = checkRateLimit('rl-diff-key-1');
      expect(result1.remaining).toBe(96);

      const result2 = checkRateLimit('rl-diff-key-2');
      expect(result2.remaining).toBe(97);
    });
  });

  describe('getRateLimitHeaders', () => {
    it('returns correct headers', () => {
      const result = checkRateLimit('rl-headers-correct');
      const headers = getRateLimitHeaders(result);

      expect(headers['X-RateLimit-Limit']).toBe('100');
      expect(headers['X-RateLimit-Remaining']).toBe('99');
      expect(headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('returns zero remaining when limit hit', () => {
      for (let i = 0; i < 100; i++) {
        checkRateLimit('rl-zero-remaining');
      }
      const result = checkRateLimit('rl-zero-remaining');
      const headers = getRateLimitHeaders(result);

      expect(headers['X-RateLimit-Remaining']).toBe('0');
    });
  });
});
