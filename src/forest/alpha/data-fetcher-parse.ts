// Alpha Research Data Fetcher — URL building, response parsing, candle validation

import type { DataSource, Candle } from './data-fetcher-types';
import { KLINE_LIMIT, timeframeToMs } from './data-fetcher-constants';

export function buildUrl(source: DataSource, symbol: string, timeframe: string, startMs: number): string {
  const s = encodeURIComponent(symbol.replace('/', ''));
  switch (source) {
    case 'binance':
      return `https://api.binance.com/api/v3/klines?symbol=${s}&interval=${timeframe}&startTime=${startMs}&limit=${KLINE_LIMIT}`;
    case 'bybit':
      return `https://api.bybit.com/v5/market/kline?category=spot&symbol=${s}&interval=${timeframe}&start=${startMs}&limit=${KLINE_LIMIT}`;
    case 'okx':
      return `https://www.okx.com/api/v5/market/history-candles?instId=${s}&bar=${timeframe}&after=${startMs}&limit=${KLINE_LIMIT}`;
    default:
      throw new Error(`Unsupported data source: ${source}`);
  }
}

export function parseResponse(source: DataSource, body: unknown): Array<[number, number, number, number, number, number]> {
  let rows: unknown[][];
  if (source === 'okx') {
    rows = (body as { data?: unknown[][] }).data ?? [];
  } else if (source === 'binance') {
    rows = body as unknown[][];
  } else {
    rows = (body as { result?: { list?: unknown[][] } }).result?.list ?? [];
  }
  return rows.map((r) => {
    if (source === 'binance') {
      return [Number(r[0]), Number(r[1]), Number(r[2]), Number(r[3]), Number(r[4]), Number(r[5])];
    }
    return [Number(r[0]), Number(r[1]), Number(r[2]), Number(r[3]), Number(r[4]), Number(r[5])];
  });
}

export function validateCandles(raw: Array<[number, number, number, number, number, number]>, timeframe: string): Candle[] {
  const sorted = [...raw].sort((a, b) => a[0] - b[0]);
  const expectedGap = timeframeToMs(timeframe);
  const candles: Candle[] = [];

  for (const row of sorted) {
    const [ts, o, h, l, c, v] = row;
    if (ts <= 0 || o <= 0 || h <= 0 || l <= 0 || c <= 0 || v < 0) continue;
    if (candles.length > 0) {
      const delta = ts - candles[candles.length - 1].timestamp;
      if (delta > expectedGap * 2 && delta > 60_000) {
        // Gap detected — keep both ends, consumer can use gap info
      }
    }
    candles.push({ timestamp: ts, open: o, high: h, low: l, close: c, volume: v });
  }

  return candles;
}
