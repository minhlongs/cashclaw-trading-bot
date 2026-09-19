// Alpha Research Data Fetcher — Phase 16
// Fetches OHLCV candles for alpha signal research using public exchange REST APIs.

import { rateLimiter } from '@/tree/exchange/rate-limiter';
import { createLogger } from '@/lib/logger';
import type { DataSource, FetchConfig, Candle, CandleSource } from './data-fetcher-types';
import { MAX_BACKOFF_MS, MAX_RETRIES, timeframeToMs } from './data-fetcher-constants';
import { buildUrl, parseResponse, validateCandles } from './data-fetcher-parse';

const log = createLogger('alpha-data-fetcher');

class HttpCandleSource implements CandleSource {
  async fetchCandles(config: FetchConfig): Promise<Candle[]> {
    const exchangeKey = config.source;
    const category = 'api';

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

export function createCandleSource(_source: DataSource): CandleSource {
  return new HttpCandleSource();
}

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
        log.warn(`${key} failed`, { action: 'fetchResearchData', key, error: err instanceof Error ? err : new Error(String(err)) });
      }
    }),
  );

  return results;
}

export type { DataSource, FetchConfig, Candle, CandleSource };
