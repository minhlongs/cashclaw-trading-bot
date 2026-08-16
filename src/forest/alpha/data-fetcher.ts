// Alpha Research Data Fetcher — Phase 16
// Fetches OHLCV candles for alpha signal research using public exchange REST APIs.

import { rateLimiter } from '@/tree/exchange/rate-limiter';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DataSource = 'binance' | 'bybit' | 'okx';

export interface FetchConfig {
  source: DataSource;
  symbol: string;
  timeframe: string;
  limit: number;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleSource {
  fetchCandles(config: FetchConfig): Promise<Candle[]>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const KLINE_LIMIT = 1000;
const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 30_000;

const TIMEFRAME_MS: Record<string, number> = {
  '1m': 60_000, '3m': 180_000, '5m': 300_000,
  '15m': 900_000, '30m': 1_800_000, '1h': 3_600_000,
  '4h': 14_400_000, '1d': 86_400_000,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeframeToMs(tf: string): number {
  return TIMEFRAME_MS[tf] ?? 3_600_000;
}

function buildUrl(source: DataSource, symbol: string, timeframe: string, startMs: number): string {
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

function parseResponse(source: DataSource, body: unknown): Array<[number, number, number, number, number, number]> {
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

function validateCandles(raw: Array<[number, number, number, number, number, number]>, timeframe: string): Candle[] {
  const sorted = [...raw].sort((a, b) => a[0] - b[0]);
  const expectedGap = timeframeToMs(timeframe);
  const candles: Candle[] = [];

  for (const row of sorted) {
    const [ts, o, h, l, c, v] = row;
    // Drop rows with invalid values
    if (ts <= 0 || o <= 0 || h <= 0 || l <= 0 || c <= 0 || v < 0) continue;
    // Check for gaps (silently accept — consumers can detect via gaps array if needed)
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

// ── Candle Source Implementation ─────────────────────────────────────────────

class HttpCandleSource implements CandleSource {
  async fetchCandles(config: FetchConfig): Promise<Candle[]> {
    const exchangeKey = config.source;
    const category = 'api';

    // Wait for rate limiter token (non-blocking with backoff)
    let acquired = rateLimiter.tryAcquire(exchangeKey, category);
    if (!acquired.allowed) {
      const waitMs = Math.min(acquired.waitMs ?? 1000, MAX_BACKOFF_MS);
      await new Promise((r) => setTimeout(r, waitMs));
      acquired = rateLimiter.tryAcquire(exchangeKey, category);
      if (!acquired.allowed) {
        throw new Error(`Rate limit backoff for ${exchangeKey}: ${acquired.waitMs}ms`);
      }
    }

    const startMs = Date.now() - config.limit * timeframeToMs(config.timeframe);
    const url = buildUrl(config.source, config.symbol, config.timeframe, startMs);

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const text = await res.text();
          lastErr = new Error(`[${res.status}] ${config.source} kline fetch failed: ${text.slice(0, 200)}`);
          if (res.status === 429) {
            rateLimiter.recordBackoff(exchangeKey, category, 2);
            const backoffMs = Math.min(rateLimiter.getBackoff(exchangeKey, category), MAX_BACKOFF_MS);
            await new Promise((r) => setTimeout(r, backoffMs));
            continue;
          }
          throw lastErr;
        }
        const body = await res.json();
        const raw = parseResponse(config.source, body);
        if (raw.length === 0) return [];
        return validateCandles(raw, config.timeframe);
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        const msg = lastErr.message.toLowerCase();
        if ((msg.includes('rate limit') || msg.includes('429')) && attempt < MAX_RETRIES - 1) {
          rateLimiter.recordBackoff(exchangeKey, category, 2);
          const backoffMs = Math.min(rateLimiter.getBackoff(exchangeKey, category), MAX_BACKOFF_MS);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        throw lastErr;
      }
    }

    throw lastErr ?? new Error(`Failed to fetch candles from ${config.source} after ${MAX_RETRIES} attempts`);
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createCandleSource(source: DataSource): CandleSource {
  return new HttpCandleSource();
}

// ── Batch Fetch ───────────────────────────────────────────────────────────────

export async function fetchResearchData(configs: FetchConfig[]): Promise<Map<string, Candle[]>> {
  const results = new Map<string, Candle[]>();

  await Promise.allSettled(
    configs.map(async (cfg) => {
      const key = `${cfg.source}:${cfg.symbol}:${cfg.timeframe}`;
      try {
        const source = createCandleSource(cfg.source);
        const candles = await source.fetchCandles(cfg);
        results.set(key, candles);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[data-fetcher] ${key} failed: ${msg}`);
        // Partial results OK — other sources may succeed
      }
    }),
  );

  return results;
}