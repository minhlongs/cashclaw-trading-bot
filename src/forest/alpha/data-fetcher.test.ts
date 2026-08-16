import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchResearchData, type FetchConfig } from './data-fetcher';

const spy = vi.spyOn(globalThis, 'fetch');
afterEach(() => { spy.mockReset(); });

function ok(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
}

function err(status: number, body: string) {
  return { ok: false, status, text: () => Promise.resolve(body) };
}

describe('fetchResearchData — binance', () => {
  const mk = (ts: number) => [ts, '42000', '42500', '41500', '42200', '100'] as const;

  it('fetches and validates candles', async () => {
    spy.mockResolvedValue(ok([mk(1704067200000), mk(1704070800000)]) as Response);
    const configs: FetchConfig[] = [
      { source: 'binance', symbol: 'BTC/USDT', timeframe: '1h', limit: 10 },
    ];
    const result = await fetchResearchData(configs);
    expect(result.size).toBe(1);
    expect(result.get('binance:BTC/USDT:1h')).toHaveLength(2);
  });

  it('retries on 429 then succeeds', async () => {
    spy.mockResolvedValueOnce(err(429, 'rate limit') as Response);
    spy.mockResolvedValueOnce(ok([mk(1704067200000)]) as Response);
    const configs: FetchConfig[] = [
      { source: 'binance', symbol: 'BTC/USDT', timeframe: '1h', limit: 10 },
    ];
    const result = await fetchResearchData(configs);
    expect(result.get('binance:BTC/USDT:1h')).toHaveLength(1);
  });

  it('returns empty for empty array', async () => {
    spy.mockResolvedValue(ok([]) as Response);
    const configs: FetchConfig[] = [
      { source: 'binance', symbol: 'BTC/USDT', timeframe: '1h', limit: 10 },
    ];
    const result = await fetchResearchData(configs);
    expect(result.get('binance:BTC/USDT:1h')).toEqual([]);
  });
});

describe('fetchResearchData — bybit', () => {
  const mk = (ts: number) => [String(ts), '42000', '42500', '41500', '42200', '100'];

  it('parses bybit format', async () => {
    spy.mockResolvedValue(ok({ result: { list: [mk(1704067200000), mk(1704070800000)] } }) as Response);
    const configs: FetchConfig[] = [
      { source: 'bybit', symbol: 'BTC/USDT', timeframe: '1h', limit: 10 },
    ];
    const result = await fetchResearchData(configs);
    expect(result.get('bybit:BTC/USDT:1h')).toHaveLength(2);
  });

  it('retries on 429 then succeeds', async () => {
    spy.mockResolvedValueOnce(err(429, 'rate limit') as Response);
    spy.mockResolvedValueOnce(ok({ result: { list: [mk(1704067200000)] } }) as Response);
    const configs: FetchConfig[] = [
      { source: 'bybit', symbol: 'BTC/USDT', timeframe: '1h', limit: 10 },
    ];
    const result = await fetchResearchData(configs);
    expect(result.get('bybit:BTC/USDT:1h')).toHaveLength(1);
  });
});

describe('fetchResearchData — okx', () => {
  const mk = (ts: number) => [String(ts), '42000', '42500', '41500', '42200', '100'];

  it('parses okx format', async () => {
    spy.mockResolvedValue(ok({ data: [mk(1704067200000), mk(1704070800000)] }) as Response);
    const configs: FetchConfig[] = [
      { source: 'okx', symbol: 'BTC-USDT', timeframe: '1h', limit: 10 },
    ];
    const result = await fetchResearchData(configs);
    expect(result.get('okx:BTC-USDT:1h')).toHaveLength(2);
  });

  it('returns empty for empty array', async () => {
    spy.mockResolvedValue(ok({ data: [] }) as Response);
    const configs: FetchConfig[] = [
      { source: 'okx', symbol: 'BTC-USDT', timeframe: '1h', limit: 10 },
    ];
    const result = await fetchResearchData(configs);
    expect(result.get('okx:BTC-USDT:1h')).toEqual([]);
  });
});

describe('fetchResearchData — partial failures', () => {
  it('some sources fail, others succeed', async () => {
    spy.mockResolvedValueOnce(err(500, 'Server error') as Response);
    spy.mockResolvedValueOnce(ok({ data: [[1700000000000, '42000', '42500', '41500', '42200', '100']] }) as Response);

    const configs: FetchConfig[] = [
      { source: 'binance', symbol: 'BTC/USDT', timeframe: '1h', limit: 10 },
      { source: 'okx', symbol: 'ETH/USDT', timeframe: '1h', limit: 10 },
    ];

    const result = await fetchResearchData(configs);
    expect(result.size).toBe(1);
    expect(result.has('okx:ETH/USDT:1h')).toBe(true);
    expect(result.has('binance:BTC/USDT:1h')).toBe(false);
  });
});

describe('fetchResearchData — validation', () => {
  it('drops invalid candles (zero/negative prices)', async () => {
    const base = 1700000000000;
    spy.mockResolvedValue(ok([
      [base, 0, 100, 50, 75, 10],      // open=0
      [base + 3600000, -1, 10, 5, 8, 1], // negative price
      [base + 7200000, 42000, 42500, 41500, 42200, 100], // valid
    ]) as Response);

    const configs: FetchConfig[] = [
      { source: 'binance', symbol: 'BTC/USDT', timeframe: '1h', limit: 10 },
    ];
    const result = await fetchResearchData(configs);
    expect(result.get('binance:BTC/USDT:1h')).toHaveLength(1);
  });
});