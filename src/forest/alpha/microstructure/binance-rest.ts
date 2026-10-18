// Binance REST microstructure fetchers — pure Workers-compatible fetch() with rate-limiting and 429 backoff.
import { rateLimiter } from '@/tree/exchange/rate-limiter';
import { createLogger } from '@/lib/logger';

const log = createLogger('microstructure-fetch');
const DEFAULT_BASE_URL = 'https://api.binance.com';
const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 30_000;
const DEPTH_LIMIT = 20;
const AGG_TRADES_LIMIT = 1000;

export interface RawFetchResult { readonly body: unknown; readonly latencyMs: number }
export interface FetchDepthParams { readonly symbol: string; readonly baseUrl?: string }

/** GET /api/v3/depth?symbol=X&limit=20 — current order-book snapshot. */
export async function fetchDepth(params: FetchDepthParams): Promise<RawFetchResult> {
  const url = `${params.baseUrl ?? DEFAULT_BASE_URL}/api/v3/depth?symbol=${encodeURIComponent(params.symbol)}&limit=${DEPTH_LIMIT}`;
  return fetchWithRetry(url);
}

export interface FetchAggTradesParams {
  readonly symbol: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly fromId?: number;
  readonly baseUrl?: string;
}

/** GET /api/v3/aggTrades?symbol=X&startTime=…&endTime=… — aggregated prints in the window. */
export async function fetchAggTrades(params: FetchAggTradesParams): Promise<RawFetchResult> {
  let url = `${params.baseUrl ?? DEFAULT_BASE_URL}/api/v3/aggTrades?symbol=${encodeURIComponent(params.symbol)}&startTime=${params.startMs}&endTime=${params.endMs}&limit=${AGG_TRADES_LIMIT}`;
  if (params.fromId !== undefined) url += `&fromId=${params.fromId}`;
  return fetchWithRetry(url);
}

async function fetchWithRetry(url: string): Promise<RawFetchResult> {
  const exchangeKey = 'binance';
  const category = 'api' as const;

  let acquired = rateLimiter.tryAcquire(exchangeKey, category);
  if (!acquired.allowed) {
    const waitMs = Math.min(acquired.waitMs ?? 1000, MAX_BACKOFF_MS);
    await new Promise((r) => setTimeout(r, waitMs));
    acquired = rateLimiter.tryAcquire(exchangeKey, category);
    if (!acquired.allowed) {
      throw new Error(`Rate limit backoff for ${exchangeKey}: ${acquired.waitMs}ms`);
    }
  }

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const startedAt = Date.now();
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text();
        lastErr = new Error(`[HTTP ${res.status}] depth/trades fetch failed: ${text.slice(0, 200)}`);
        if (res.status === 429 && attempt < MAX_RETRIES - 1) {
          rateLimiter.recordBackoff(exchangeKey, category, 2);
          const backoffMs = Math.min(rateLimiter.getBackoff(exchangeKey, category), MAX_BACKOFF_MS);
          log.warn('429 received, backing off', { action: 'fetch', attempt, backoffMs });
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        throw lastErr;
      }
      return { body: await res.json(), latencyMs: Date.now() - startedAt };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const msg = lastErr.message.toLowerCase();
      if ((msg.includes('rate limit') || msg.includes('429')) && attempt < MAX_RETRIES - 1) {
        rateLimiter.recordBackoff(exchangeKey, category, 2);
        await new Promise((r) => setTimeout(r, Math.min(rateLimiter.getBackoff(exchangeKey, category), MAX_BACKOFF_MS)));
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr ?? new Error(`Binance fetch failed after ${MAX_RETRIES} attempts`);
}
