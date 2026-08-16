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

  it('reports breaker state from primary when fallback succeeds', async () => {
    primary.placeOrder = vi.fn().mockRejectedValue(new Error('Primary down'));
    fallback.placeOrder = vi.fn().mockResolvedValue({ ok: true } as never);
    fallback.circuitBreaker.getState = vi.fn().mockReturnValue('closed');

    const result = await chain().execute((p) => p.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market' } as never));

    expect(result.ok).toBe(true);
    expect(result.provenance.provider).toBe('fallback');
    expect(fallback.circuitBreaker.getState).toHaveBeenCalled();
  });

  it('returns failure without fallback when fallback is disabled', async () => {
    primary.placeOrder = vi.fn().mockRejectedValue(new Error('Primary down'));
    primary.circuitBreaker.getState = vi.fn().mockReturnValue('open');

    const result = await chain(false).execute((p) => p.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market' } as never));

    expect(result.ok).toBe(false);
    expect(fallback.placeOrder).not.toHaveBeenCalled();
  });

  // --- Cross-provider consistency tests ---

  it('skips fallback entirely when primary succeeds', async () => {
    primary.placeOrder = vi.fn().mockResolvedValue({ ok: true, id: '1' });

    const result = await chain().execute((p) => p.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market' } as never));

    expect(result.ok).toBe(true);
    expect(result.provenance.provider).toBe('primary');
    expect(fallback.placeOrder).not.toHaveBeenCalled();
  });

  it('includes latencyMs in provenance', async () => {
    primary.fetchTicker = vi.fn().mockResolvedValue({ symbol: 'BTC/USDT', last: 50000 });

    const result = await chain().execute((p) => p.fetchTicker('BTC/USDT'));

    expect(result.ok).toBe(true);
    expect(typeof result.provenance.latencyMs).toBe('number');
    expect(result.provenance.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('combines error messages from both providers when both fail', async () => {
    primary.placeOrder = vi.fn().mockRejectedValue(new Error('primary down'));
    fallback.placeOrder = vi.fn().mockRejectedValue(new Error('fallback down'));

    const result = await chain().execute((p) => p.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market' } as never));

    expect(result.ok).toBe(false);
    // Error format: `${primaryName}: ${fallbackError} (fallback ${fallbackName} also failed)`
    expect(result.error).toContain('fallback down');
    expect(result.error).toContain('fallback fallback also failed');
  });

  it('handles non-Error rejection from primary', async () => {
    primary.placeOrder = vi.fn().mockRejectedValue('string error');
    fallback.placeOrder = vi.fn().mockResolvedValue({ ok: true } as never);

    const result = await chain().execute((p) => p.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market' } as never));

    expect(result.ok).toBe(true);
    expect(result.provenance.provider).toBe('fallback');
  });

  it('reports fallback circuit state when fallback serves', async () => {
    primary.placeOrder = vi.fn().mockRejectedValue(new Error('down'));
    fallback.placeOrder = vi.fn().mockResolvedValue({ ok: true });
    fallback.circuitBreaker.getState = vi.fn().mockReturnValue('half_open');

    const result = await chain().execute((p) => p.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market' } as never));

    expect(result.ok).toBe(true);
    expect(result.provenance.circuitState).toBe('half_open');
  });

  it('fallback circuit-open does not prevent primary success', async () => {
    // Fallback has open circuit, but primary succeeds — no fallback call needed
    fallback.circuitBreaker.getState = vi.fn().mockReturnValue('open');
    primary.placeOrder = vi.fn().mockResolvedValue({ ok: true, id: '1' });

    const result = await chain().execute((p) => p.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market' } as never));

    expect(result.ok).toBe(true);
    expect(result.provenance.provider).toBe('primary');
    expect(fallback.placeOrder).not.toHaveBeenCalled();
  });

  it('works with fetchTicker on fallback after primary failure', async () => {
    primary.fetchTicker = vi.fn().mockRejectedValue(new Error('REST down'));
    fallback.fetchTicker = vi.fn().mockResolvedValue({ symbol: 'ETH/USDT', last: 3000 });

    const result = await chain().execute((p) => p.fetchTicker('ETH/USDT'));

    expect(result.ok).toBe(true);
    expect(result.provenance.provider).toBe('fallback');
    expect(result.data).toEqual({ symbol: 'ETH/USDT', last: 3000 });
  });
});