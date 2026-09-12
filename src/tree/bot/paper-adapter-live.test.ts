import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPaperAdapter } from './paper-adapter';
import type { Ticker } from '../exchange/types';

describe('createPaperAdapter - live ticker support', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns live ticker when tickerFetcher resolves', async () => {
    const mockTicker: Ticker = {
      symbol: 'BTC/USDT',
      last: 65000,
      bid: 64990,
      ask: 65010,
      high24h: 66000,
      low24h: 64000,
      volume24h: 1200,
      timestamp: 1789195000000,
    };
    const tickerFetcher = vi.fn().mockResolvedValue(mockTicker);
    const adapter = createPaperAdapter(10000, { tickerFetcher });

    const ticker = await adapter.fetchTicker('BTC/USDT');
    expect(tickerFetcher).toHaveBeenCalledWith('BTC/USDT');
    expect(ticker).toEqual(mockTicker);
    expect(ticker.last).toBe(65000);
  });

  it('falls back to zero ticker when tickerFetcher throws error', async () => {
    const tickerFetcher = vi.fn().mockRejectedValue(new Error('Network error'));
    const adapter = createPaperAdapter(10000, { tickerFetcher });

    const ticker = await adapter.fetchTicker('ETH/USDT');
    expect(tickerFetcher).toHaveBeenCalledWith('ETH/USDT');
    expect(ticker.last).toBe(0);
    expect(ticker.bid).toBe(0);
    expect(ticker.ask).toBe(0);
    expect(ticker.symbol).toBe('ETH/USDT');
    expect(ticker.timestamp).toBe(Date.now());
  });

  it('falls back to zero ticker when tickerFetcher resolves null or undefined', async () => {
    const tickerFetcher = vi.fn().mockResolvedValue(null as unknown as Ticker);
    const adapter = createPaperAdapter(10000, { tickerFetcher });

    const ticker = await adapter.fetchTicker('SOL/USDT');
    expect(ticker.last).toBe(0);
    expect(ticker.symbol).toBe('SOL/USDT');
  });

  it('returns simulated zero ticker when options or tickerFetcher is omitted', async () => {
    const adapterWithEmptyOptions = createPaperAdapter(10000, {});
    const ticker1 = await adapterWithEmptyOptions.fetchTicker('BTC/USDT');
    expect(ticker1.last).toBe(0);
    expect(ticker1.symbol).toBe('BTC/USDT');

    const adapterWithoutOptions = createPaperAdapter(5000);
    const ticker2 = await adapterWithoutOptions.fetchTicker('BTC/USDT');
    expect(ticker2.last).toBe(0);
    expect(ticker2.symbol).toBe('BTC/USDT');
  });
});
