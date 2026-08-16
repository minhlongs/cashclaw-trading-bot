import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker';

function failingFn(): Promise<string> {
  return Promise.reject(new Error('fail'));
}

function successFn(): Promise<string> {
  return Promise.resolve('ok');
}

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // tripTime + 5000ms cooldown + 2000ms half-open delay = 7000ms to half_open
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial state', () => {
    it('starts closed', () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      expect(cb.getState()).toBe('closed');
    });

    it('tracks zero failures on start', () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      expect(cb.getFailureCount()).toBe(0);
    });
  });

  describe('success', () => {
    it('returns the wrapped value', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      const result = await cb.execute(successFn);
      expect(result).toBe('ok');
    });

    it('resets failure count and closes circuit on success', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      await cb.execute(failingFn).catch(() => {});
      expect(cb.getFailureCount()).toBe(1);

      await cb.execute(successFn);
      expect(cb.getFailureCount()).toBe(0);
      expect(cb.getState()).toBe('closed');
    });
  });

  describe('degraded threshold', () => {
    it('enters degraded after threshold consecutive failures', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      await cb.execute(failingFn).catch(() => {});
      expect(cb.getState()).toBe('closed');
      await cb.execute(failingFn).catch(() => {});
      expect(cb.getState()).toBe('closed');

      await cb.execute(failingFn).catch(() => {});
      expect(cb.getState()).toBe('degraded');
    });

    it('next failure in degraded trips OPEN', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      expect(cb.getState()).toBe('degraded');

      await cb.execute(failingFn).catch(() => {});
      expect(cb.getState()).toBe('open');
    });

    it('blocks calls when open via CircuitOpenError', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});

      await expect(cb.execute(successFn)).rejects.toThrow(CircuitOpenError);
    });

    it('error includes retry delay', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      await cb.execute(failingFn).catch(() => {});
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

    it('accumulates failure count correctly', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      await cb.execute(failingFn).catch(() => {});
      expect(cb.getFailureCount()).toBe(1);
      await cb.execute(failingFn).catch(() => {});
      expect(cb.getFailureCount()).toBe(2);
    });

    it('does not open until threshold (3) reached', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      await cb.execute(failingFn).catch(() => {});
      expect(cb.getState()).toBe('closed');
      await cb.execute(failingFn).catch(() => {});
      expect(cb.getState()).toBe('closed');
    });
  });

  describe('half_open trials', () => {
    it('transitions to half_open after full cooldown (7s)', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      expect(cb.getState()).toBe('open');

      vi.advanceTimersByTime(7001);
      expect(cb.getState()).toBe('half_open');
    });

    it('half_open success closes circuit', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      expect(cb.getState()).toBe('open');

      vi.advanceTimersByTime(7001);

      const result = await cb.execute(successFn);
      expect(result).toBe('ok');
      expect(cb.getState()).toBe('closed');
    });

    it('half_open failure reopens', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      expect(cb.getState()).toBe('open');

      vi.advanceTimersByTime(7001);

      await cb.execute(failingFn).catch(() => {});
      expect(cb.getState()).toBe('open');
    });

    it('blocks opens before cooldown elapses', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});

      vi.advanceTimersByTime(5000);
      expect(cb.getState()).toBe('open');
    });
  });

  describe('reset', () => {
    it('resets circuit back to closed', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      expect(cb.getState()).toBe('open');

      cb.reset();
      expect(cb.getState()).toBe('closed');
      expect(cb.getFailureCount()).toBe(0);
    });
  });

  describe('state change notifications', () => {
    it('fires callback on state change with kind and timestamp', async () => {
      const onChange = vi.fn();
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000, onStateChange: onChange });

      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      expect(onChange).not.toHaveBeenCalled();

      await cb.execute(failingFn).catch(() => {});
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith('closed', 'degraded', expect.any(Number), 'unknown');

      await cb.execute(failingFn).catch(() => {});
      expect(onChange).toHaveBeenLastCalledWith('degraded', 'open', expect.any(Number), 'unknown');

      vi.advanceTimersByTime(7001);
      cb.getState();

      expect(onChange).toHaveBeenLastCalledWith('open', 'half_open', expect.any(Number), undefined);

      await cb.execute(successFn);
      expect(onChange).toHaveBeenLastCalledWith('half_open', 'closed', expect.any(Number), undefined);
      expect(onChange).toHaveBeenCalledTimes(4);
    });

    it('does not fire when state does not change', async () => {
      const onChange = vi.fn();
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000, onStateChange: onChange });
      await cb.execute(failingFn).catch(() => {});
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('kind-aware thresholds', () => {
    it('timeout trips after 3', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      const err = new Error('ETIMEDOUT');

      await cb.execute(() => Promise.reject(err)).catch(() => {});
      expect(cb.getState()).toBe('closed');

      await cb.execute(() => Promise.reject(err)).catch(() => {});
      expect(cb.getState()).toBe('closed');

      await cb.execute(() => Promise.reject(err)).catch(() => {});
      expect(cb.getState()).toBe('degraded');
    });

    it('rate_limit trips after 5', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      const err = new Error('429 Too Many Requests');

      for (let i = 0; i < 4; i++) {
        await cb.execute(() => Promise.reject(err)).catch(() => {});
      }
      expect(cb.getState()).toBe('closed');

      await cb.execute(() => Promise.reject(err)).catch(() => {});
      expect(cb.getState()).toBe('degraded');
    });

    it('unknown trips after 3', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      expect(cb.getState()).toBe('degraded');
    });

    it('different kinds use independent counters', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });

      await cb.execute(() => Promise.reject(new Error('ETIMEDOUT'))).catch(() => {});
      await cb.execute(() => Promise.reject(new Error('ETIMEDOUT'))).catch(() => {});
      expect(cb.getState()).toBe('closed');

      await cb.execute(() => Promise.reject(new Error('ENOTFOUND'))).catch(() => {});
      expect(cb.getState()).toBe('closed');

      await cb.execute(() => Promise.reject(new Error('ENOTFOUND'))).catch(() => {});
      expect(cb.getState()).toBe('degraded');
    });

    it('onStateChange receives kind for same-kind degraded→open', async () => {
      const onChange = vi.fn();
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000, onStateChange: onChange });

      await cb.execute(() => Promise.reject(new Error('ETIMEDOUT'))).catch(() => {});
      await cb.execute(() => Promise.reject(new Error('ETIMEDOUT'))).catch(() => {});
      await cb.execute(() => Promise.reject(new Error('ETIMEDOUT'))).catch(() => {});

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith('closed', 'degraded', expect.any(Number), 'timeout');
    });

    it('unknown kind uses kind-specific threshold (3)', async () => {
      const cb = new CircuitBreaker({ cooldownMs: 5000, halfOpenAfterMs: 2000 });

      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      await cb.execute(failingFn).catch(() => {});
      // ranks up at kind-specific unknown threshold (3)
      expect(cb.getState()).toBe('degraded');
    });
  });
});