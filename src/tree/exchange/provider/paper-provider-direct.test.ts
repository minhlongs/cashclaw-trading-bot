import { describe, it, expect, vi } from 'vitest';
import { PaperExchangeProvider } from './paper-provider';
import type { Ticker } from '../types';
import type { TickerProvider } from './provider';
import { CircuitBreaker } from './circuit-breaker';

describe('PaperExchangeProvider - Direct Integration', () => {
  const initialBalances = [{ currency: 'USDT', total: 10_000 }];

  const mockTicker: Ticker = {
    symbol: 'BTC/USDT',
    last: 65000.0,
    bid: 64990.0,
    ask: 65010.0,
    high24h: 66000.0,
    low24h: 64000.0,
    volume24h: 1200.0,
    timestamp: 1700000000000,
  };

  it('routes ticker requests through injected directTickerProvider and tracks success latency', async () => {
    const mockFetchTicker = vi.fn().mockResolvedValue(mockTicker);
    const mockDtp: TickerProvider = {
      name: 'direct:binance',
      circuitBreaker: new CircuitBreaker({ cooldownMs: 1000, halfOpenAfterMs: 500 }),
      healthCheck: vi.fn().mockResolvedValue(true),
      fetchTicker: mockFetchTicker,
    };

    const provider = new PaperExchangeProvider({
      type: 'paper',
      exchangeId: 'binance',
      initialBalances,
      directTickerProvider: mockDtp,
    });

    const ticker = await provider.fetchTicker('binance', 'BTC/USDT');
    expect(ticker).toEqual(mockTicker);
    expect(mockFetchTicker).toHaveBeenCalledWith('BTC/USDT');

    const health = provider.getHealth();
    expect(health.failureCount).toBe(0);
    expect(health.score).toBe(100);
    expect(health.lastSuccess).toBeGreaterThan(0);
  });

  it('uses direct tickerFetcher function when supplied directly', async () => {
    const customFetcher = vi.fn().mockResolvedValue(mockTicker);
    const provider = new PaperExchangeProvider({
      type: 'paper',
      exchangeId: 'okx',
      initialBalances,
      tickerFetcher: customFetcher,
    });

    const ticker = await provider.fetchTicker('okx', 'BTC/USDT');
    expect(ticker).toEqual(mockTicker);
    expect(customFetcher).toHaveBeenCalledWith('okx', 'BTC/USDT');
  });

  it('records failure and degrades health when provider call fails', async () => {
    const provider = new PaperExchangeProvider({
      type: 'paper',
      exchangeId: 'binance',
      initialBalances,
    });

    await expect(
      provider.fetchOrder('binance', 'non_existent_id', 'BTC/USDT')
    ).rejects.toThrow('Order not found: non_existent_id');

    const health = provider.getHealth();
    expect(health.failureCount).toBe(1);
    expect(health.score).toBe(85);
  });
});
