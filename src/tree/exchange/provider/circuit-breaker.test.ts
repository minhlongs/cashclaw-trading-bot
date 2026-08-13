import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

function failingFn(): Promise<string> {
  return Promise.reject(new Error('fail'));
}

function successFn(): Promise<string> {
  return Promise.resolve('ok');
}

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    // halfOpenAt = tripTime + cooldownMs(5000) + halfOpenAfterMs(2000) = tripTime + 7000ms
    cb = new CircuitBreaker({
      threshold: 3,
      cooldownMs: 5000,
      halfOpenAfterMs: 2000,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts in closed state', () => {
      expect(cb.getState()).toBe('closed');
    });

    it('starts with zero failure count', () => {
      expect(cb.getFailureCount()).toBe(0);
    });
  });

  describe('success behavior', () => {
    it('returns result on success', async () => {
      const result = await cb.execute(successFn);
      expect(result).toBe('ok');
    });

    it('resets failure count on success', async () => {
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      expect(cb.getFailureCount()).toBe(2);

      await cb.execute(successFn);
      expect(cb.getFailureCount()).toBe(0);
    });
  });

  describe('failure threshold triggering OPEN', () => {
    it('transitions to open after threshold consecutive failures', async () => {
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});

      expect(cb.getState()).toBe('open');
    });

    it('does not open on failures below threshold', async () => {
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});

      expect(cb.getState()).toBe('closed');
    });

    it('increments failure count on each failure', async () => {
      await cb.execute(failingFn).catch(() => {});
      expect(cb.getFailureCount()).toBe(1);
      await cb.execute(failingFn).catch(() => {});
      expect(cb.getFailureCount()).toBe(2);
    });

    it('throws CircuitOpenError when circuit is open', async () => {
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});

      await expect(cb.execute(successFn)).rejects.toThrow(CircuitOpenError);
    });

    it('provides retryAfterMs in error', async () => {
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});

      try {
        await cb.execute(successFn);
      } catch (e) {
        expect(e).toBeInstanceOf(CircuitOpenError);
        expect((e as CircuitOpenError).retryAfterMs).toBeGreaterThan(0);
      }
    });
  });

  describe('HALF_OPEN state', () => {
    it('transitions to half_open after full cooldown (7s)', async () => {
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});

      // halfOpenAt = tripTime + 5000 + 2000 = tripTime + 7000
      vi.advanceTimersByTime(7001);

      expect(cb.getState()).toBe('half_open');
    });

    it('allows trial execution in half_open', async () => {
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});

      vi.advanceTimersByTime(7001);

      const result = await cb.execute(successFn);
      expect(result).toBe('ok');
      expect(cb.getState()).toBe('closed');
    });

    it('reopens circuit on failed trial in half_open', async () => {
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});

      vi.advanceTimersByTime(7001);

      await cb.execute(failingFn).catch(() => {});

      expect(cb.getState()).toBe('open');
    });

    it('does not transition before cooldown', async () => {
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});

      vi.advanceTimersByTime(3000);

      expect(cb.getState()).toBe('open');
    });
  });

  describe('custom threshold', () => {
    it('opens after custom threshold', async () => {
      const custom = new CircuitBreaker({
        threshold: 1,
        cooldownMs: 5000,
        halfOpenAfterMs: 2000,
      });

      await custom.execute(failingFn).catch(() => {});

      expect(custom.getState()).toBe('open');
    });
  });

  describe('reset', () => {
    it('resets to initial state', async () => {
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});

      cb.reset();

      expect(cb.getState()).toBe('closed');
      expect(cb.getFailureCount()).toBe(0);
    });
  });
});
