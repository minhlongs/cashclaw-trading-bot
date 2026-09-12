import { describe, it, expect, vi } from 'vitest';
import { DirectTickerProvider } from './direct-ticker-provider';
import { BinanceRestClient } from './binance-rest-client';
import { OkxRestClient } from './okx-rest-client';
import { BybitRestClient } from './bybit-rest-client';
import { CircuitBreaker } from '../provider/circuit-breaker';

describe('DirectTickerProvider - Happy Path', () => {
  it('instantiates correctly for binance, okx, and bybit with defaults', () => {
    const bProvider = new DirectTickerProvider({ exchangeId: 'binance' });
    expect(bProvider.name).toBe('direct:binance');
    expect(bProvider.exchangeId).toBe('binance');
    expect(bProvider.getClient()).toBeInstanceOf(BinanceRestClient);

    const oProvider = new DirectTickerProvider({ exchangeId: 'okx' });
    expect(oProvider.name).toBe('direct:okx');
    expect(oProvider.exchangeId).toBe('okx');
    expect(oProvider.getClient()).toBeInstanceOf(OkxRestClient);

    const yProvider = new DirectTickerProvider({ exchangeId: 'bybit' });
    expect(yProvider.name).toBe('direct:bybit');
    expect(yProvider.exchangeId).toBe('bybit');
    expect(yProvider.getClient()).toBeInstanceOf(BybitRestClient);
  });

  it('allows injecting a custom circuit breaker and custom client', () => {
    const breaker = new CircuitBreaker({ cooldownMs: 1000, halfOpenAfterMs: 500 });
    const client = new BinanceRestClient();
    const provider = new DirectTickerProvider({
      exchangeId: 'binance',
      circuitBreaker: breaker,
      client,
    });

    expect(provider.circuitBreaker).toBe(breaker);
    expect(provider.getClient()).toBe(client);
  });

  it('performs successful healthCheck via client ping', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
      text: async () => '{}',
    });

    const provider = new DirectTickerProvider({
      exchangeId: 'binance',
      restConfig: { fetchFn: mockFetch },
    });

    const healthy = await provider.healthCheck();
    expect(healthy).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith('https://api.binance.com/api/v3/ping', { method: 'GET' });
  });

  it('fetches and normalizes Binance ticker with symbol translation', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        symbol: 'BTCUSDT',
        lastPrice: '60000.0',
        bidPrice: '59990.0',
        askPrice: '60010.0',
        highPrice: '61000.0',
        lowPrice: '59000.0',
        volume: '100.5',
        closeTime: 1700000000000,
      }),
    });

    const provider = new DirectTickerProvider({
      exchangeId: 'binance',
      restConfig: { fetchFn: mockFetch },
    });

    const ticker = await provider.fetchTicker('BTC/USDT');
    expect(ticker).toEqual({
      symbol: 'BTC/USDT',
      last: 60000.0,
      bid: 59990.0,
      ask: 60010.0,
      high24h: 61000.0,
      low24h: 59000.0,
      volume24h: 100.5,
      timestamp: 1700000000000,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT',
      { method: 'GET' }
    );
  });

  it('fetches and normalizes OKX ticker with symbol translation', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: '0',
        msg: '',
        data: [{
          instId: 'BTC-USDT',
          last: '60000.0',
          bidPx: '59990.0',
          askPx: '60010.0',
          high24h: '61000.0',
          low24h: '59000.0',
          vol24h: '100.5',
          ts: '1700000000000',
        }],
      }),
    });

    const provider = new DirectTickerProvider({
      exchangeId: 'okx',
      restConfig: { fetchFn: mockFetch },
    });

    const ticker = await provider.fetchTicker('BTC/USDT');
    expect(ticker.symbol).toBe('BTC/USDT');
    expect(ticker.last).toBe(60000.0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT',
      { method: 'GET' }
    );
  });

  it('fetches and normalizes Bybit ticker with symbol translation', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        retCode: 0,
        retMsg: 'OK',
        result: {
          list: [{
            symbol: 'BTCUSDT',
            lastPrice: '60000.0',
            bid1Price: '59990.0',
            ask1Price: '60010.0',
            highPrice24h: '61000.0',
            lowPrice24h: '59000.0',
            volume24h: '100.5',
          }],
        },
      }),
    });

    const provider = new DirectTickerProvider({
      exchangeId: 'bybit',
      restConfig: { fetchFn: mockFetch },
    });

    const ticker = await provider.fetchTicker('BTC/USDT');
    expect(ticker.symbol).toBe('BTC/USDT');
    expect(ticker.last).toBe(60000.0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT',
      { method: 'GET' }
    );
  });
});
