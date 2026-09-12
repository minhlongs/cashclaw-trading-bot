import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  GET,
  setDirectTickerProviderForTest,
  resetProvidersForTest,
} from './route';
import type { DirectTickerProvider } from '@/tree/exchange/direct';
import type { Ticker } from '@/tree/exchange/types';

function createMockTicker(symbol: string, last: number): Ticker {
  return {
    symbol,
    last,
    bid: last - 10,
    ask: last + 10,
    high24h: last + 500,
    low24h: last - 500,
    volume24h: 1250,
    timestamp: 1789195000000,
  };
}

function createMockProvider(exchangeId: 'binance' | 'okx' | 'bybit', last: number, circuitState = 'closed'): DirectTickerProvider {
  return {
    name: `direct:${exchangeId}`,
    exchangeId,
    circuitBreaker: {
      getState: vi.fn().mockReturnValue(circuitState),
    },
    healthCheck: vi.fn().mockResolvedValue(true),
    fetchTicker: vi.fn().mockImplementation(async (symbol: string) => createMockTicker(symbol, last)),
  } as unknown as DirectTickerProvider;
}

describe('GET /api/tickers', () => {
  beforeEach(() => {
    resetProvidersForTest();
    vi.clearAllMocks();
  });

  it('fetches valid Binance ticker on happy path', async () => {
    const mockBinance = createMockProvider('binance', 65000);
    setDirectTickerProviderForTest('binance', mockBinance);

    const req = new NextRequest('http://localhost:3000/api/tickers?exchange=binance&symbol=BTC/USDT');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(true);
    const ticker = json.ticker as Ticker;
    expect(ticker.symbol).toBe('BTC/USDT');
    expect(ticker.last).toBe(65000);
    const provenance = json.provenance as Record<string, unknown>;
    expect(provenance.exchange).toBe('binance');
    expect(provenance.provider).toBe('DirectTickerProvider');
    expect(provenance.circuitState).toBe('closed');
    expect(typeof provenance.latencyMs).toBe('number');
  });

  it('fetches valid OKX ticker', async () => {
    const mockOkx = createMockProvider('okx', 3500);
    setDirectTickerProviderForTest('okx', mockOkx);

    const req = new NextRequest('http://localhost:3000/api/tickers?exchange=okx&symbol=ETH/USDT');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect((json.ticker as Ticker).symbol).toBe('ETH/USDT');
    expect((json.ticker as Ticker).last).toBe(3500);
  });

  it('fetches valid Bybit ticker', async () => {
    const mockBybit = createMockProvider('bybit', 140);
    setDirectTickerProviderForTest('bybit', mockBybit);

    const req = new NextRequest('http://localhost:3000/api/tickers?exchange=bybit&symbol=SOL/USDT');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect((json.ticker as Ticker).symbol).toBe('SOL/USDT');
    expect((json.ticker as Ticker).last).toBe(140);
  });

  it('defaults to binance and BTC/USDT when query parameters are omitted', async () => {
    const mockBinance = createMockProvider('binance', 65500);
    setDirectTickerProviderForTest('binance', mockBinance);

    const req = new NextRequest('http://localhost:3000/api/tickers');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(true);
    expect((json.ticker as Ticker).symbol).toBe('BTC/USDT');
    expect((json.provenance as Record<string, unknown>).exchange).toBe('binance');
  });

  it('normalizes delimiter variations like BTCUSDT and BTC-USDT to canonical BTC/USDT', async () => {
    const mockBinance = createMockProvider('binance', 65000);
    setDirectTickerProviderForTest('binance', mockBinance);

    const req1 = new NextRequest('http://localhost:3000/api/tickers?symbol=BTCUSDT');
    const res1 = await GET(req1);
    expect(res1.status).toBe(200);
    expect(((await res1.json()) as { ticker: Ticker }).ticker.symbol).toBe('BTC/USDT');

    const req2 = new NextRequest('http://localhost:3000/api/tickers?symbol=BTC-USDT');
    const res2 = await GET(req2);
    expect(res2.status).toBe(200);
    expect(((await res2.json()) as { ticker: Ticker }).ticker.symbol).toBe('BTC/USDT');
  });

  it('returns 400 Bad Request on invalid exchange', async () => {
    const req = new NextRequest('http://localhost:3000/api/tickers?exchange=kraken&symbol=BTC/USDT');
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(false);
    expect(json.error).toBe('Invalid query parameters');
  });

  it('returns 400 Bad Request on empty or malformed symbol', async () => {
    const emptyReq = new NextRequest('http://localhost:3000/api/tickers?symbol=');
    const emptyRes = await GET(emptyReq);
    expect(emptyRes.status).toBe(400);

    const malformedReq = new NextRequest('http://localhost:3000/api/tickers?symbol=BTC///USDT');
    const malformedRes = await GET(malformedReq);
    expect(malformedRes.status).toBe(400);
    const malformedJson = (await malformedRes.json()) as Record<string, unknown>;
    expect(malformedJson.ok).toBe(false);
  });

  it('returns 503 when circuit breaker is open', async () => {
    const openMock = createMockProvider('binance', 0, 'open');
    setDirectTickerProviderForTest('binance', openMock);

    const req = new NextRequest('http://localhost:3000/api/tickers?exchange=binance&symbol=BTC/USDT');
    const res = await GET(req);

    expect(res.status).toBe(503);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(false);
    expect((json.provenance as Record<string, unknown>).circuitState).toBe('open');
  });

  it('returns 502 when upstream fetchTicker throws network error', async () => {
    const failingMock = {
      name: 'direct:binance',
      exchangeId: 'binance',
      circuitBreaker: { getState: vi.fn().mockReturnValue('closed') },
      healthCheck: vi.fn().mockResolvedValue(false),
      fetchTicker: vi.fn().mockRejectedValue(new Error('Upstream timeout 504')),
    } as unknown as DirectTickerProvider;

    setDirectTickerProviderForTest('binance', failingMock);

    const req = new NextRequest('http://localhost:3000/api/tickers?exchange=binance&symbol=BTC/USDT');
    const res = await GET(req);

    expect(res.status).toBe(502);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(false);
    expect(json.error).toBe('Upstream timeout 504');
  });

  it('returns 429 Too Many Requests when IP rate limit is exceeded', async () => {
    const mockBinance = createMockProvider('binance', 65000);
    setDirectTickerProviderForTest('binance', mockBinance);

    const uniqueIp = `192.0.2.${Math.floor(Math.random() * 200 + 1)}`;
    let lastRes: Awaited<ReturnType<typeof GET>> | undefined;

    for (let i = 0; i < 61; i++) {
      const req = new NextRequest('http://localhost:3000/api/tickers?symbol=BTC/USDT', {
        headers: { 'x-forwarded-for': uniqueIp },
      });
      lastRes = await GET(req);
    }

    expect(lastRes).toBeDefined();
    expect(lastRes?.status).toBe(429);
    const json = (await lastRes?.json()) as Record<string, unknown>;
    expect(json.ok).toBe(false);
    expect(json.error).toBe('Too Many Requests');
  });
});
