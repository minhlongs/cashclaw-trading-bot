import { describe, it, expect, vi } from 'vitest';
import { PaperExchangeProvider } from './paper-provider';
import { PaperProviderAdapter } from './paper-provider-adapter';

function makeProvider() {
  return new PaperExchangeProvider({
    type: 'paper',
    exchangeId: 'binance',
    initialBalances: [{ currency: 'USDT', total: 10000 }],
  });
}

describe('PaperProviderAdapter', () => {
  it('satisfies TickerProvider & OrderProvider shape', () => {
    const provider = makeProvider();
    const adapter = new PaperProviderAdapter(provider, 'binance' as never);
    expect(typeof adapter.name).toBe('string');
    expect(typeof adapter.healthCheck).toBe('function');
    expect(typeof adapter.fetchTicker).toBe('function');
    expect(typeof adapter.placeOrder).toBe('function');
    expect(adapter.circuitBreaker).toBeDefined();
  });

  it('exposes exchangeId as name', () => {
    const provider = makeProvider();
    const adapter = new PaperProviderAdapter(provider, 'binance' as never);
    expect(adapter.name).toBe('binance');
  });

  it('healthCheck returns true when provider is healthy', async () => {
    const provider = makeProvider();
    const adapter = new PaperProviderAdapter(provider, 'binance' as never);
    expect(await adapter.healthCheck()).toBe(true);
  });

  it('fetchTicker delegates to provider and returns raw Ticker', async () => {
    const provider = makeProvider();
    const spy = vi.spyOn(provider, 'fetchTicker');
    const adapter = new PaperProviderAdapter(provider, 'binance' as never);
    const result = await adapter.fetchTicker('BTC/USDT');
    expect(spy).toHaveBeenCalledWith('binance', 'BTC/USDT');
    expect(result).toHaveProperty('symbol');
    expect(result).toHaveProperty('last');
  });

  it('placeOrder delegates to provider and returns raw OrderResult', async () => {
    const provider = makeProvider();
    const spy = vi.spyOn(provider, 'placeOrder');
    const adapter = new PaperProviderAdapter(provider, 'binance' as never);
    const result = await adapter.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market', quantity: 0.001 } as never);
    expect(spy).toHaveBeenCalledWith('binance', expect.objectContaining({ symbol: 'BTC/USDT' }));
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('status');
  });

  it('throws on provider error (does not wrap in ProviderResult)', async () => {
    const provider = makeProvider();
    vi.spyOn(provider, 'fetchTicker').mockRejectedValue(new Error('circuit open'));
    const adapter = new PaperProviderAdapter(provider, 'binance' as never);
    await expect(adapter.fetchTicker('BTC/USDT')).rejects.toThrow('circuit open');
  });
});