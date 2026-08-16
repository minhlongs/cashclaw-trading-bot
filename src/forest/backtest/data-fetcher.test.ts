import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchOHLCV } from './data-fetcher';
import { clearCache } from './ohlcv-cache';

const spy = vi.spyOn(globalThis, 'fetch');
beforeEach(() => { spy.mockClear(); clearCache(); });
afterEach(() => { spy.mockClear(); clearCache(); });

function ok(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
}

function err(status: number, body: string) {
  return { ok: false, status, text: () => Promise.resolve(body) };
}

describe('fetchOHLCV — binance', () => {
  const mk = (ts: number) => [ts, '42000', '42500', '41500', '42200', '100', ts + 3600000, '4220000'];

  it('returns parsed candles', async () => {
    spy.mockResolvedValue(ok([mk(1704067200000)]) as Response);
    const candles = await fetchOHLCV('binance', 'BTCUSDT', '1h', 1704067200000, 1704070800000);
    expect(candles).toHaveLength(1);
    expect(candles[0]).toMatchObject({ open: 42000, high: 42500, low: 41500, close: 42200 });
  });

  it('throws on non-ok response', async () => {
    spy.mockResolvedValue(err(429, 'rate limit') as Response);
    await expect(fetchOHLCV('binance', 'BTCUSDT', '1h', 1704067200000, 1704070800000)).rejects.toThrow('429');
  });

  it('fetches multiple pages when KLINE_LIMIT returned', async () => {
    const interval = 3600000;
    const page1Start = 1704067200000 + 200 * interval;
    const page1 = Array.from({ length: 1000 }, (_, i) => mk(page1Start + i * interval));
    const page2Start = 1704067200000 + 50 * interval;
    const page2 = Array.from({ length: 1000 }, (_, i) => mk(page2Start + i * interval));
    spy
      .mockResolvedValueOnce(ok(page1) as Response)
      .mockResolvedValueOnce(ok(page2) as Response);
    const candles = await fetchOHLCV('binance', 'BTCUSDT', '1h', 1704067200000, 1704067200000 + 2500 * interval);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(candles.length).toBeGreaterThanOrEqual(1000);
  });

  it('returns empty when API returns empty', async () => {
    spy.mockResolvedValue(ok([]) as Response);
    const candles = await fetchOHLCV('binance', 'BTCUSDT', '1h', 1704067200000, 1704070800000);
    expect(candles).toHaveLength(0);
  });

  it('deduplicates by timestamp', async () => {
    const ts = 1704067200000;
    const page1 = [mk(ts), mk(ts + 3600000), mk(ts + 7200000)];
    spy.mockResolvedValueOnce(ok(page1) as Response);
    const candles = await fetchOHLCV('binance', 'BTCUSDT', '1h', ts, ts + 7200000);
    expect(candles).toHaveLength(3);
  });
});

describe('fetchOHLCV — bybit', () => {
  it('parses bybit kline format', async () => {
    spy.mockResolvedValue(ok({
      ret_code: 0,
      result: { list: [['1704067200000', '42000', '42500', '41500', '42200', '100', '4220000']] },
    }) as Response);
    const candles = await fetchOHLCV('bybit', 'BTCUSDT', '1h', 1704067200000, 1704070800000);
    expect(candles).toHaveLength(1);
    expect(candles[0].open).toBe(42000);
  });

  it('handles empty result list', async () => {
    spy.mockResolvedValue(ok({ ret_code: 0, result: { list: [] } }) as Response);
    const candles = await fetchOHLCV('bybit', 'BTCUSDT', '1h', 1704067200000, 1704070800000);
    expect(candles).toHaveLength(0);
  });
});

describe('fetchOHLCV — okx', () => {
  it('parses okx candle format', async () => {
    spy.mockResolvedValue(ok([
      ['1704067200000', '42000', '42500', '41500', '42200', '100', '4220000', '4220000', '1'],
    ]) as Response);
    const candles = await fetchOHLCV('okx', 'BTC-USDT', '1h', 1704067200000, 1704070800000);
    expect(candles).toHaveLength(1);
    expect(candles[0].open).toBe(42000);
  });

  it('returns empty for empty array', async () => {
    spy.mockResolvedValue(ok([]) as Response);
    const candles = await fetchOHLCV('okx', 'BTC-USDT', '1h', 1704067200000, 1704070800000);
    expect(candles).toHaveLength(0);
  });
});

describe('fetchOHLCV — unsupported exchange', () => {
  it('throws for unknown exchange', async () => {
    await expect(fetchOHLCV('kraken', 'XBT/USD', '1h', 1704067200000, 1704070800000)).rejects.toThrow('Unsupported exchange');
  });
});
