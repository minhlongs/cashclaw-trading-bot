import { describe, it, expect, vi } from 'vitest';
import { DirectTickerProvider } from './direct-ticker-provider';
import { CircuitBreaker, CircuitOpenError } from '../provider/circuit-breaker';
import type { ExchangeId } from '../types';

describe('DirectTickerProvider - Error & Circuit Breaker', () => {
  it('throws on unsupported exchange ID', () => {
    expect(
      () => new DirectTickerProvider({ exchangeId: 'kraken' as unknown as ExchangeId })
    ).toThrow('Unsupported exchange ID: kraken');
  });

  it('healthCheck returns false when ping fails or network throws', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network offline'));
    const provider = new DirectTickerProvider({
      exchangeId: 'binance',
      restConfig: { fetchFn: mockFetch },
    });

    expect(await provider.healthCheck()).toBe(false);
  });

  it('healthCheck returns false immediately when circuit breaker is open without network call', async () => {
    const mockFetch = vi.fn();
    const breaker = new CircuitBreaker({ cooldownMs: 60_000, halfOpenAfterMs: 30_000 });
    // Force circuit breaker to trip open
    for (let i = 0; i < 10; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        // ignore
      }
    }
    expect(breaker.getState()).toBe('open');

    const provider = new DirectTickerProvider({
      exchangeId: 'binance',
      circuitBreaker: breaker,
      restConfig: { fetchFn: mockFetch },
    });

    const healthy = await provider.healthCheck();
    expect(healthy).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetchTicker propagates HTTP error fail-closed and trips circuit breaker', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const breaker = new CircuitBreaker({ cooldownMs: 60_000, halfOpenAfterMs: 30_000 });
    const provider = new DirectTickerProvider({
      exchangeId: 'binance',
      circuitBreaker: breaker,
      restConfig: { fetchFn: mockFetch },
    });

    await expect(provider.fetchTicker('BTC/USDT')).rejects.toThrow('Binance REST 500');

    // Cause repeated failures to trip circuit to open
    for (let i = 0; i < 10; i++) {
      try {
        await provider.fetchTicker('BTC/USDT');
      } catch {
        // ignore
      }
    }

    expect(breaker.getState()).toBe('open');
    await expect(provider.fetchTicker('BTC/USDT')).rejects.toBeInstanceOf(CircuitOpenError);
  });
});
