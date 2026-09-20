// OHLCV response parsers for public exchange kline endpoints.
// Each parser normalises a raw exchange response into Candle[] (ascending by timestamp).

import type { Candle } from './ohlcv';

export function parseBinance(raw: unknown): Candle[] {
  const arr = raw as unknown[];
  return arr.map((k) => {
    const row = k as unknown[];
    return {
      timestamp: row[0] as number,
      open: parseFloat(row[1] as string),
      high: parseFloat(row[2] as string),
      low: parseFloat(row[3] as string),
      close: parseFloat(row[4] as string),
      volume: parseFloat(row[5] as string),
    };
  });
}

export function parseBybit(raw: unknown): Candle[] {
  const items = (raw as { result: { list: [string, string, string, string, string, string][] } }).result.list ?? [];
  // bybit returns [startTime, open, high, low, close, volume, turnover] — newest first
  return items
    .map((k) => ({
      timestamp: parseInt(k[0], 10),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))
    .reverse(); // oldest first for backtest iteration
}

export function parseOkx(raw: unknown): Candle[] {
  const arr = raw as unknown[][];
  // okx returns [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm] — newest first
  return arr
    .map((k) => ({
      timestamp: parseInt(k[0] as string, 10),
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
      volume: parseFloat(k[5] as string),
    }))
    .reverse();
}
