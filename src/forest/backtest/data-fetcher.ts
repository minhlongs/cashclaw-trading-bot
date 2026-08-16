// Historical OHLCV fetcher — Binance public API (no auth required)
// Supports binance, bybit, okx (all have public kline endpoints)

import type { Candle } from './ohlcv';
import { loadCandles, saveCandles, getCacheKey } from './ohlcv-cache';

const KLINE_LIMIT = 1000;

function binanceUrl(symbol: string, interval: string, startMs: number, endMs: number): string {
  const s = encodeURIComponent(symbol.replace('/', ''));
  return `https://api.binance.com/api/v3/klines?symbol=${s}&interval=${interval}&startTime=${startMs}&endTime=${endMs}&limit=${KLINE_LIMIT}`;
}

function bybitUrl(symbol: string, interval: string, startMs: number, endMs: number): string {
  const s = encodeURIComponent(symbol.replace('/', ''));
  return `https://api.bybit.com/v5/market/kline?category=spot&symbol=${s}&interval=${interval}&start=${startMs}&end=${endMs}&limit=${KLINE_LIMIT}`;
}

function okxUrl(symbol: string, interval: string, startMs: number, endMs: number): string {
  const s = encodeURIComponent(symbol.replace('/', '-'));
  return `https://www.okx.com/api/v5/market/history-candles?instId=${s}&bar=${interval}&after=${endMs}&before=${startMs}&limit=${KLINE_LIMIT}`;
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

  const all: Candle[] = [];
  let cursorEnd = endMs;

  while (cursorEnd > startMs) {
    const { url, parse } = buildRequest(exchange, symbol, interval, startMs, cursorEnd);
    const response = await fetch(url);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`[${response.status}] ${exchange} kline fetch failed: ${body.slice(0, 200)}`);
    }

    const data = await response.json();
    const batch = parse(data);

    if (batch.length === 0) break;

    // Remove duplicates across pagination windows
    if (all.length > 0) {
      const firstTs = batch[0].timestamp;
      const lastExisting = all[all.length - 1].timestamp;
      if (firstTs <= lastExisting) {
        const dupIdx = batch.findIndex((c) => c.timestamp > lastExisting);
        if (dupIdx === -1) break;
        all.push(...batch.slice(dupIdx));
      } else {
        all.push(...batch);
      }
    } else {
      all.push(...batch);
    }

    cursorEnd = batch[0].timestamp - 1;
    if (cursorEnd <= startMs) break;

    // Rate-limit courtesy pause
    await new Promise((r) => setTimeout(r, 120));
  }

  // Filter to requested range, dedupe by timestamp, sort asc
  const seen = new Set<number>();
  const result = all
    .filter((c) => c.timestamp >= startMs && c.timestamp <= endMs && !seen.has(c.timestamp))
    .map((c) => {
      seen.add(c.timestamp);
      return c;
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  // 2. Persist to cache (non-fatal if write fails)
  if (result.length > 0) {
    saveCandles(cacheKey, result);
  }

  return result;
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
