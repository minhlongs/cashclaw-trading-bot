import { describe, it, expect, vi } from 'vitest';
import { PaperExchange, type MarketDataFetcher } from './index';
import type { Ticker } from '../types';

describe('PaperExchange - Direct Market Data Integration', () => {
  const initialBalances = [
    { currency: 'USDT', total: 10_000 },
    { currency: 'BTC', total: 1 },
  ];

  const mockLiveTicker: Ticker = {
    symbol: 'BTC/USDT',
    last: 62500.0,
    bid: 62490.0,
    ask: 62510.0,
    high24h: 63000.0,
    low24h: 61000.0,
    volume24h: 5000.0,
    timestamp: 1700000000000,
  };

  it('uses direct ticker fetcher when supplied in options', async () => {
    const fetcher: MarketDataFetcher = vi.fn().mockResolvedValue(mockLiveTicker);
    const exchange = new PaperExchange(initialBalances, { tickerFetcher: fetcher });

    const ticker = await exchange.fetchTicker('binance', 'BTC/USDT');
    expect(ticker).toEqual(mockLiveTicker);
    expect(fetcher).toHaveBeenCalledWith('binance', 'BTC/USDT');
  });

  it('falls back gracefully to simulated ticker when fetcher throws', async () => {
    const fetcher: MarketDataFetcher = vi.fn().mockRejectedValue(new Error('Network error'));
    const exchange = new PaperExchange(initialBalances, { tickerFetcher: fetcher });

    const ticker = await exchange.fetchTicker('binance', 'BTC/USDT');
    expect(ticker.symbol).toBe('BTC/USDT');
    expect(ticker.last).toBe(0);
    expect(ticker.bid).toBe(0);
    expect(ticker.ask).toBe(0);
  });

  it('falls back to simulated ticker when no fetcher is provided', async () => {
    const exchange = new PaperExchange(initialBalances);
    const ticker = await exchange.fetchTicker('okx', 'ETH/USDT');
    expect(ticker.symbol).toBe('ETH/USDT');
    expect(ticker.last).toBe(0);
  });

  it('allows dynamic registration of ticker fetcher via setTickerFetcher', async () => {
    const exchange = new PaperExchange(initialBalances);
    const before = await exchange.fetchTicker('bybit', 'SOL/USDT');
    expect(before.last).toBe(0);

    const solTicker: Ticker = { ...mockLiveTicker, symbol: 'SOL/USDT', last: 150.0 };
    exchange.setTickerFetcher(vi.fn().mockResolvedValue(solTicker));

    const after = await exchange.fetchTicker('bybit', 'SOL/USDT');
    expect(after.last).toBe(150.0);
  });

  it('preserves ADR-001 paper-only execution: orders are purely local in-memory', async () => {
    const fetcher: MarketDataFetcher = vi.fn().mockResolvedValue(mockLiveTicker);
    const exchange = new PaperExchange(initialBalances, { tickerFetcher: fetcher });

    // Place a simulated market order
    const result = await exchange.placeOrder('binance', {
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'market',
      quantity: 0.1,
      price: 62500,
    });

    expect(result.status).toBe('filled');
    expect(result.filled).toBe(0.1);
    expect(result.id).toMatch(/^paper_/);

    // Verify order is stored only in local in-memory Map
    expect(exchange.getOrders().size).toBe(1);
    expect(exchange.getOrder(result.id)?.symbol).toBe('BTC/USDT');
  });
});
