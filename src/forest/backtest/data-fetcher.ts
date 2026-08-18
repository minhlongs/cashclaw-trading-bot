// Historical OHLCV fetcher — Binance public API (no auth required)
// Supports binance, bybit, okx (all have public kline endpoints)

import type { Candle } from './ohlcv';
import { loadCandles, saveCandles, getCacheKey } from './ohlcv-cache';

const KLINE_LIMIT = 1000;

function binanceUrl(symbol: string, interval: string, startMs: number | undefined, endMs: number): string {
  const s = encodeURIComponent(symbol.replace('/', ''));
  const start = startMs !== undefined ? `&startTime=${startMs}` : '';
  return `https://api.binance.com/api/v3/klines?symbol=${s}&interval=${interval}${start}&endTime=${endMs}&limit=${KLINE_LIMIT}`;
}

function bybitUrl(symbol: string, interval: string, startMs: number | undefined, endMs: number): string {
  const s = encodeURIComponent(symbol.replace('/', ''));
  const start = startMs !== undefined ? `&start=${startMs}` : '';
  return `https://api.bybit.com/v5/market/kline?category=spot&symbol=${s}&interval=${interval}${start}&end=${endMs}&limit=${KLINE_LIMIT}`;
}

function okxUrl(symbol: string, interval: string, startMs: number | undefined, endMs: number): string {
  const s = encodeURIComponent(symbol.replace('/', '-'));
  const after = startMs !== undefined ? `&after=${startMs}` : '';
  return `https://www.okx.com/api/v5/market/history-candles?instId=${s}&bar=${interval}${after}&before=${endMs}&limit=${KLINE_LIMIT}`;
}

function parseBinance(raw: unknown): Candle[] {
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

function parseBybit(raw: unknown): Candle[] {
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

function parseOkx(raw: unknown): Candle[] {
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

/**
 * Fetch historical candles from a public exchange API.
 * Automatically paginates if the date range exceeds the exchange limit.
 */
export async function fetchOHLCV(
  exchange: string,
  symbol: string,
  interval: string,
  startMs: number,
  endMs: number,
): Promise<Candle[]> {
  // 1. Check cache before hitting exchange
  const cacheKey = getCacheKey(exchange, symbol, interval);
  const cached = loadCandles(cacheKey);
  if (cached && cached.candles.length > 0) {
    const lastCached = cached.candles[cached.candles.length - 1].timestamp;
    if (lastCached >= endMs) {
      return cached.candles.filter((c) => c.timestamp >= startMs && c.timestamp <= endMs);
    }
  }

  const seen = new Set<number>();
  const all: Candle[] = [];
  let cursorEnd = endMs;

  while (cursorEnd > startMs) {
    // Binance endTime-only returns up to 1000 candles up to that point.  This
    // lets us page backwards through time reliably.  We filter to [startMs,
    // endMs] after the loop.
    const { url, parse } = buildRequestCapped(exchange, symbol, interval, cursorEnd);
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`[${response.status}] ${exchange} kline fetch failed: ${body.slice(0, 200)}`);
    }

    const data = await response.json();
    const batch = parse(data);

    if (batch.length === 0) break;

    // Binance returns in descending order when endTime-only is used; normalise
    // to ascending and dedupe by timestamp.
    for (const c of batch) {
      if (!seen.has(c.timestamp)) {
        seen.add(c.timestamp);
        all.push(c);
      }
    }

    cursorEnd = batch[0].timestamp - 1;
    if (cursorEnd <= startMs) break;

    // Rate-limit courtesy pause
    await new Promise((r) => setTimeout(r, 120));
  }

  // Sort ascending, filter to requested range
  const result = all
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter((c) => c.timestamp >= startMs && c.timestamp <= endMs);

  // 2. Persist to cache (non-fatal if write fails)
  if (result.length > 0) {
    saveCandles(cacheKey, result);
  }

  return result;
}

function buildRequestCapped(
  exchange: string,
  symbol: string,
  interval: string,
  endMs: number,
): { url: string; parse: (data: unknown) => Candle[] } {
  switch (exchange) {
    case 'binance': {
      const s = encodeURIComponent(symbol.replace('/', ''));
      return {
        url: `https://api.binance.com/api/v3/klines?symbol=${s}&interval=${interval}&endTime=${endMs}&limit=${KLINE_LIMIT}`,
        parse: parseBinance,
      };
    }
    case 'bybit': {
      const s = encodeURIComponent(symbol.replace('/', ''));
      return {
        url: `https://api.bybit.com/v5/market/kline?category=spot&symbol=${s}&interval=${interval}&end=${endMs}&limit=${KLINE_LIMIT}`,
        parse: parseBybit,
      };
    }
    case 'okx': {
      const s = encodeURIComponent(symbol.replace('/', '-'));
      return {
        url: `https://www.okx.com/api/v5/market/history-candles?instId=${s}&bar=${interval}&after=${endMs}&limit=${KLINE_LIMIT}`,
        parse: parseOkx,
      };
    }
    default:
      throw new Error(`Unsupported exchange: ${exchange}`);
  }
}

function buildRequest(
  exchange: string,
  symbol: string,
  interval: string,
  startMs: number,
  endMs: number,
): { url: string; parse: (data: unknown) => Candle[] } {
  switch (exchange) {
    case 'binance':
      return {
        url: binanceUrl(symbol, interval, startMs, endMs),
        parse: parseBinance,
      };
    case 'bybit':
      return {
        url: bybitUrl(symbol, interval, startMs, endMs),
        parse: parseBybit,
      };
    case 'okx':
      return {
        url: okxUrl(symbol, interval, startMs, endMs),
        parse: parseOkx,
      };
    default:
      throw new Error(`Unsupported exchange: ${exchange}`);
  }
}
