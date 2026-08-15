import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CircuitBreaker, CircuitState } from './circuit-breaker';
import { ProviderChain, type TickerProvider, type OrderProvider } from './provider';

type DummyProvider = TickerProvider & OrderProvider;

function makeProvider(name: string, state: CircuitState = 'closed'): DummyProvider {
  const breaker = {
    getState: vi.fn().mockReturnValue(state),
  } as unknown as CircuitBreaker;
  return {
    name,
    circuitBreaker: breaker,
    healthCheck: vi.fn().mockResolvedValue(true),
    fetchTicker: vi.fn(),
    placeOrder: vi.fn(),
  };
}

describe('ProviderChain', () => {
  let primary: DummyProvider;
  let fallback: DummyProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    primary = makeProvider('primary');
    fallback = makeProvider('fallback', 'closed');
  });

  const chain = (fallbackEnabled = true) =>
    new ProviderChain({
      primary,
      fallback: fallbackEnabled ? fallback : undefined,
    });

  it('invokes fallback exactly once on primary failure', async () => {
    primary.placeOrder = vi.fn().mockRejectedValue(new Error('Primary down'));
    fallback.placeOrder = vi.fn().mockResolvedValue({ ok: true } as never);

    const result = await chain().execute((p) => p.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market' } as never));

    expect(result.ok).toBe(true);
    expect(primary.placeOrder).toHaveBeenCalledTimes(1);
    expect(fallback.placeOrder).toHaveBeenCalledTimes(1);
  });

  it('keeps breaker state synchronized across chain transitions', async () => {
    primary.placeOrder = vi.fn().mockRejectedValue(new Error('Primary down'));
    fallback.placeOrder = vi.fn().mockResolvedValue({ ok: true } as never);

    primary.circuitBreaker.getState = vi.fn().mockReturnValueOnce('closed').mockReturnValueOnce('open').mockReturnValueOnce('half_open');
    fallback.circuitBreaker.getState = vi.fn().mockReturnValue('closed');

    const result = await chain().execute((p) => p.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market' } as never));

    expect(result.ok).toBe(true);
    expect(result.provenance.circuitState).toBe('closed');
    expect(primary.circuitBreaker.getState).toHaveBeenCalled();
  });

  it('shares breaker state across chain reuse', async () => {
    primary.placeOrder = vi.fn().mockRejectedValue(new Error('Primary down'));
    fallback.placeOrder = vi.fn().mockResolvedValue({ ok: true } as never);

    const states: CircuitState[] = [];
    primary.circuitBreaker.getState = vi.fn().mockImplementation(() => {
      states.push('half_open');
      return 'half_open';
    });

    const providerChain = chain();
    await providerChain.execute((p) => p.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market' } as never));
    await providerChain.execute((p) => p.placeOrder({ symbol: 'BTC/USDT', side: 'sell', type: 'market' } as never));

    expect(states.length).toBeGreaterThanOrEqual(2);
  });

  it('returns failure without fallback when fallback is disabled', async () => {
    primary.placeOrder = vi.fn().mockRejectedValue(new Error('Primary down'));
    primary.circuitBreaker.getState = vi.fn().mockReturnValue('open');

    const result = await chain(false).execute((p) => p.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market' } as never));

    expect(result.ok).toBe(false);
    expect(fallback.placeOrder).not.toHaveBeenCalled();
  });
});