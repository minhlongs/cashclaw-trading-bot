import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CircuitBreaker, CircuitState } from './circuit-breaker';
import type { TickerProvider, OrderProvider } from './provider';
import { RoutingChain } from './routing-chain';

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

describe('RoutingChain', () => {
  let binance: DummyProvider;
  let bybit: DummyProvider;
  let okx: DummyProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    binance = makeProvider('binance');
    bybit = makeProvider('bybit');
    okx = makeProvider('okx');
  });

  it('throws when constructed with an empty provider list', () => {
    expect(() => new RoutingChain([])).toThrow('at least one provider');
  });

  it('stops at first success without calling later providers', async () => {
    binance.fetchTicker = vi.fn().mockResolvedValue({ symbol: 'BTC/USDT', last: 50000 });
    const chain = new RoutingChain([binance, bybit, okx]);

    const result = await chain.execute((p) => p.fetchTicker('BTC/USDT'));

    expect(result.ok).toBe(true);
    expect(bybit.fetchTicker).not.toHaveBeenCalled();
    expect(okx.fetchTicker).not.toHaveBeenCalled();
  });

  it('falls through to fallback on primary failure with correct provenance', async () => {
    binance.placeOrder = vi.fn().mockRejectedValue(new Error('binance down'));
    bybit.placeOrder = vi.fn().mockResolvedValue({ id: 'o1' });
    const chain = new RoutingChain([binance, bybit]);

    const result = await chain.execute((p) => p.placeOrder({
      symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.001,
    }));

    expect(result.ok).toBe(true);
    expect(result.provenance.provider).toBe('bybit');
    expect(binance.placeOrder).toHaveBeenCalledTimes(1);
    expect(bybit.placeOrder).toHaveBeenCalledTimes(1);
  });

  it('reports winning provider latency, not total elapsed time', async () => {
    binance.fetchTicker = vi.fn().mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('slow fail')), 30)),
    );
    bybit.fetchTicker = vi.fn().mockResolvedValue({ symbol: 'BTC/USDT', last: 50000 });
    const chain = new RoutingChain([binance, bybit]);

    const result = await chain.execute((p) => p.fetchTicker('BTC/USDT'));

    expect(result.ok).toBe(true);
    expect(result.provenance.provider).toBe('bybit');
    // Winner latency must exclude the ~30ms primary failure window
    expect(result.provenance.latencyMs).toBeLessThan(25);
  });

  it('returns ok:false listing every attempted exchange when all fail', async () => {
    binance.fetchTicker = vi.fn().mockRejectedValue(new Error('b down'));
    bybit.fetchTicker = vi.fn().mockRejectedValue(new Error('bb down'));
    okx.fetchTicker = vi.fn().mockRejectedValue(new Error('o down'));
    const chain = new RoutingChain([binance, bybit, okx]);

    const result = await chain.execute((p) => p.fetchTicker('BTC/USDT'));

    expect(result.ok).toBe(false);
    expect(result.error).toContain('All providers failed');
    expect(result.error).toContain('binance: b down');
    expect(result.error).toContain('bybit: bb down');
    expect(result.error).toContain('okx: o down');
  });

  it('reports last provider circuit state and full latency when all fail', async () => {
    binance.fetchTicker = vi.fn().mockRejectedValue(new Error('down'));
    bybit.circuitBreaker.getState = vi.fn().mockReturnValue('open');
    bybit.fetchTicker = vi.fn().mockRejectedValue(new Error('down'));
    const chain = new RoutingChain([binance, bybit]);

    const result = await chain.execute((p) => p.fetchTicker('BTC/USDT'));

    expect(result.ok).toBe(false);
    expect(result.provenance.provider).toBe('bybit');
    expect(result.provenance.circuitState).toBe('open');
    expect(result.provenance.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('handles non-Error rejections from providers', async () => {
    binance.fetchTicker = vi.fn().mockRejectedValue('string failure');
    bybit.fetchTicker = vi.fn().mockRejectedValue(undefined);
    const chain = new RoutingChain([binance, bybit]);

    const result = await chain.execute((p) => p.fetchTicker('BTC/USDT'));

    expect(result.ok).toBe(false);
    expect(result.error).toContain('binance: string failure');
    expect(result.error).toContain('bybit:');
  });

  it('reports the serving provider circuit state on success', async () => {
    binance.fetchTicker = vi.fn().mockRejectedValue(new Error('down'));
    bybit.circuitBreaker.getState = vi.fn().mockReturnValue('half_open');
    bybit.fetchTicker = vi.fn().mockResolvedValue({ symbol: 'BTC/USDT', last: 1 });
    const chain = new RoutingChain([binance, bybit]);

    const result = await chain.execute((p) => p.fetchTicker('BTC/USDT'));

    expect(result.ok).toBe(true);
    expect(result.provenance.circuitState).toBe('half_open');
  });

  it('never resets or mutates provider circuit breakers', async () => {
    binance.placeOrder = vi.fn().mockRejectedValue(new Error('down'));
    bybit.placeOrder = vi.fn().mockResolvedValue({ id: 'o2' });
    const chain = new RoutingChain([binance, bybit]);

    const result = await chain.execute((p) => p.placeOrder({
      symbol: 'BTC/USDT', side: 'sell', type: 'market', quantity: 0.002,
    }));

    // The serving provider's circuit breaker getState IS called (for provenance)
    expect(bybit.circuitBreaker.getState).toHaveBeenCalled();
    // The failed provider's circuit breaker getState is NOT called (short-circuit on error)
    expect(binance.circuitBreaker.getState).not.toHaveBeenCalled();
    // No reset() exists on the read-only view used by the chain
    expect((bybit.circuitBreaker as Partial<CircuitBreaker>).reset).toBeUndefined();
  });
});
