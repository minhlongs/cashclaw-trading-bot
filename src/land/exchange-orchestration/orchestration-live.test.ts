import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExchangeOrchestrator } from './index';
import { createDefaultPaperExchangeProvider } from './provider-factory';
import { DirectTickerProvider } from '@/tree/exchange/direct';
import type { Ticker } from '@/tree/exchange/types';

describe('ExchangeOrchestrator - Live Ticker Integration', () => {
  let onError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onError = vi.fn();
  });

  it('auto-wires DirectTickerProvider for supported exchanges and fetches live ticker', async () => {
    const mockTicker: Ticker = {
      symbol: 'BTC/USDT',
      last: 62000,
      bid: 61990,
      ask: 62010,
      high24h: 63000,
      low24h: 61000,
      volume24h: 500,
      timestamp: Date.now(),
    };

    const mockDirectProvider = {
      name: 'direct:binance',
      exchangeId: 'binance',
      circuitBreaker: { getState: () => 'closed' },
      healthCheck: vi.fn().mockResolvedValue(true),
      fetchTicker: vi.fn().mockResolvedValue(mockTicker),
    } as unknown as DirectTickerProvider;

    const orchestrator = new ExchangeOrchestrator({
      onError,
      directTickerProviders: new Map([['binance', mockDirectProvider]]),
    });

    const result = await orchestrator.fetchTicker('binance', 'BTC/USDT');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(mockTicker);
      expect(result.data.last).toBe(62000);
    }
    expect(mockDirectProvider.fetchTicker).toHaveBeenCalledWith('BTC/USDT');
  });

  it('supports directTickerProviders as Record object for OKX', async () => {
    const mockTicker: Ticker = {
      symbol: 'ETH/USDT',
      last: 3200,
      bid: 3195,
      ask: 3205,
      high24h: 3300,
      low24h: 3100,
      volume24h: 1500,
      timestamp: Date.now(),
    };

    const mockDirectProvider = {
      name: 'direct:okx',
      exchangeId: 'okx',
      circuitBreaker: { getState: () => 'closed' },
      healthCheck: vi.fn().mockResolvedValue(true),
      fetchTicker: vi.fn().mockResolvedValue(mockTicker),
    } as unknown as DirectTickerProvider;

    const orchestrator = new ExchangeOrchestrator({
      onError,
      directTickerProviders: { okx: mockDirectProvider },
    });

    const result = await orchestrator.fetchTicker('okx', 'ETH/USDT');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.last).toBe(3200);
    }
    expect(mockDirectProvider.fetchTicker).toHaveBeenCalledWith('ETH/USDT');
  });

  it('routedFetchTicker works with direct ticker provider wired via registerProvider', async () => {
    const mockTicker: Ticker = {
      symbol: 'SOL/USDT',
      last: 150,
      bid: 149.8,
      ask: 150.2,
      high24h: 155,
      low24h: 145,
      volume24h: 8000,
      timestamp: Date.now(),
    };

    const mockDirectProvider = {
      name: 'direct:bybit',
      exchangeId: 'bybit',
      circuitBreaker: { getState: () => 'closed' },
      healthCheck: vi.fn().mockResolvedValue(true),
      fetchTicker: vi.fn().mockResolvedValue(mockTicker),
    } as unknown as DirectTickerProvider;

    const orchestrator = new ExchangeOrchestrator({ onError });
    const provider = createDefaultPaperExchangeProvider('bybit', {
      directTickerProvider: mockDirectProvider,
    });
    orchestrator.registerProvider('bybit', provider);

    const configResult = orchestrator.configureRouting({
      strategy: 'pinned',
      exchanges: ['bybit'],
      pinnedExchange: 'bybit',
    });
    expect(configResult.ok).toBe(true);

    const result = await orchestrator.routedFetchTicker('SOL/USDT');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.last).toBe(150);
      expect(result.data.symbol).toBe('SOL/USDT');
    }
    expect(mockDirectProvider.fetchTicker).toHaveBeenCalledWith('SOL/USDT');
  });

  it('falls back to simulated pricing (last: 0) when direct ticker fetcher throws error', async () => {
    const mockDirectProvider = {
      name: 'direct:binance',
      exchangeId: 'binance',
      circuitBreaker: { getState: () => 'closed' },
      healthCheck: vi.fn().mockResolvedValue(true),
      fetchTicker: vi.fn().mockRejectedValue(new Error('Binance 503 error')),
    } as unknown as DirectTickerProvider;

    const orchestrator = new ExchangeOrchestrator({
      onError,
      directTickerProviders: { binance: mockDirectProvider },
    });

    const result = await orchestrator.fetchTicker('binance', 'BTC/USDT');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.last).toBe(0);
      expect(result.data.symbol).toBe('BTC/USDT');
    }
  });

  it('reports error when chain execution fails completely', async () => {
    const orchestrator = new ExchangeOrchestrator({ onError });
    const mockFailingProvider = {
      fetchTicker: vi.fn().mockRejectedValue(new Error('Network offline')),
      isCircuitOpen: vi.fn().mockReturnValue(false),
      getHealth: vi.fn().mockReturnValue({ score: 100 }),
      getCircuitBreaker: vi.fn().mockReturnValue({
        getState: () => 'closed',
        execute: (fn: () => Promise<unknown>) => fn(),
      }),
    } as unknown as Parameters<typeof orchestrator.registerProvider>[1];

    orchestrator.registerProvider('broken', mockFailingProvider);
    const result = await orchestrator.fetchTicker('broken', 'BTC/USDT');
    expect(result.ok).toBe(false);
    expect(onError).toHaveBeenCalled();
  });
});
