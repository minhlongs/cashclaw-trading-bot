// Rate Limiter — per-exchange, per-endpoint token bucket
// CF Workers constraint: respect exchange rate limits to avoid HTTP 429
// Phases 3+5: exponential backoff + fair-share budget hooks

import { parseRateLimitHeaders } from './headers';
import { WedgeWatchdog } from './wedge-watchdog';
import { RateLimitExecutionTimeout } from './errors';

export type EndpointCategory = 'api' | 'order' | 'ws';

export interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const DEFAULT_LIMITS: Record<string, { capacity: number; refillMs: number }> = {
  'binance:api': { capacity: 1200, refillMs: 60000 }, // 1200 req/min
  'binance:order': { capacity: 50, refillMs: 10000 }, // 50 req/10s
  'binance:ws': { capacity: 200, refillMs: 60000 },
  'bybit:api': { capacity: 120, refillMs: 1000 }, // 120 req/s
  'bybit:order': { capacity: 20, refillMs: 1000 },
  'bybit:ws': { capacity: 200, refillMs: 60000 },
  'okx:api': { capacity: 20, refillMs: 2000 }, // 20 req/2s
  'okx:order': { capacity: 20, refillMs: 1000 },
  'okx:ws': { capacity: 200, refillMs: 60000 },
};

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private backoffState = new Map<string, { delayMs: number; expiresAt: number }>();
  private budgetMap = new Map<string, number>();
  private wedgeWatchdog: WedgeWatchdog | null = null;

  private getKey(exchange: string, category: EndpointCategory): string {
    return `${exchange}:${category}`;
  }

  private refill(key: string): TokenBucket {
    const limitKey = key;
    const limit = DEFAULT_LIMITS[limitKey] ?? { capacity: 100, refillMs: 60000 };
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: limit.capacity, lastRefill: Date.now() };
      this.buckets.set(key, bucket);
    } else {
      const elapsed = Date.now() - bucket.lastRefill;
      if (elapsed > 0) {
        const refills = Math.floor(elapsed / limit.refillMs);
        if (refills > 0) {
          bucket.tokens = Math.min(limit.capacity,
            bucket.tokens + refills * limit.capacity);
          bucket.lastRefill = Date.now();
        }
      }
    }

    return bucket;
  }

  /**
   * Legacy acquire: wait for token then consume (backward compat).
   */
  acquire(
    exchange: string,
    category: EndpointCategory,
    timeoutMs?: number,
  ): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const key = this.getKey(exchange, category);
      const bucket = this.refill(key);

      let timer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        if (timer !== undefined) clearTimeout(timer);
      };

      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          cleanup();
          reject(new RateLimitExecutionTimeout(
            `Rate limit acquire timed out after ${timeoutMs}ms`,
            timeoutMs,
          ));
        }, timeoutMs);
      }

      if (bucket.tokens >= 1 && this.getBackoff(exchange, category) === 0) {
        cleanup();
        bucket.tokens -= 1;
        this.wedgeWatchdog?.poke();
        resolve(0);
      } else {
        const waitMs =
          (bucket.tokens < 1 ? 100 : 0) +
          Math.max(0, this.getBackoff(exchange, category));

        setTimeout(() => {
          cleanup();
          const refreshed = this.refill(key);
          refreshed.tokens = Math.max(0, refreshed.tokens - 1);
          this.wedgeWatchdog?.poke();
          resolve(waitMs);
        }, waitMs + 50);
      }
    });
  }

  /**
   * Phase 3: non-blocking check with backoff awareness.
   * Returns whether call is allowed now + optional recommended waitMs.
   */
  tryAcquire(exchange: string, category: EndpointCategory) {
    const key = this.getKey(exchange, category);
    const bucket = this.refill(key);
    const backoffRemaining = this.getBackoff(exchange, category);

    if (bucket.tokens >= 1 && backoffRemaining === 0) {
      bucket.tokens -= 1;
      this.wedgeWatchdog?.poke();
      return { allowed: true as const };
    }

    return {
      allowed: false as const,
      waitMs: Math.max(50, Math.ceil(backoffRemaining) + 100),
    };
  }

  /**
   * Phase 3: escalate backoff after a failure.
   */
  recordBackoff(exchange: string, category: EndpointCategory, multiplier = 2) {
    const key = this.getKey(exchange, category);
    const existing = this.backoffState.get(key);
    const base = existing?.delayMs ?? 1000;
    const next = Math.min(60_000, base * multiplier);
    this.backoffState.set(key, {
      delayMs: next,
      expiresAt: Date.now() + next,
    });
  }

  /**
   * Phase 3: remaining backoff ms for a bucket.
   */
  getBackoff(exchange: string, category: EndpointCategory): number {
    const key = this.getKey(exchange, category);
    const state = this.backoffState.get(key);

    if (!state) return 0;
    if (state.expiresAt <= Date.now()) {
      this.backoffState.delete(key);
      return 0;
    }

    return Math.max(0, state.expiresAt - Date.now());
  }

  /**
   * Phase 5: set per-exchange+category budget weights.
   */
  setBudget(
    exchange: string,
    category: EndpointCategory,
    reqPerMin: number,
    _reqPerHour: number,
  ) {
    const key = this.getKey(exchange, category);
    this.budgetMap.set(key, reqPerMin);
  }

  /**
   * Adjust bucket tokens based on exchange rate-limit response headers.
   */
  updateFromHeaders(
    exchange: string,
    category: EndpointCategory,
    headers: Headers,
  ): void {
    const parsed = parseRateLimitHeaders(headers);
    if (parsed === null) return;

    const key = this.getKey(exchange, category);
    this.buckets.set(key, {
      tokens: parsed.remaining,
      lastRefill: parsed.resetAt,
    });
  }

  /**
   * Attach a WedgeWatchdog. When the queue appears stuck, `onWedge`
   * fires and the corresponding bucket is reset.
   */
  initWedgeWatchdog(onWedge: (exchange: string, category: EndpointCategory) => void): void {
    this.wedgeWatchdog = new WedgeWatchdog();
    this.wedgeWatchdog.start(() => {
      // Fire callback for all active buckets — caller decides action.
      for (const key of this.buckets.keys()) {
        const [exchange, category] = key.split(':') as [string, EndpointCategory];
        this.buckets.delete(key);
        this.backoffState.delete(key);
        onWedge(exchange, category);
      }
    });
  }

  /**
   * Phase 5: remaining budget count for adapter selection.
   */
  getRemainingBudget(exchange: string, category: EndpointCategory): number {
    const key = this.getKey(exchange, category);
    const budget = this.budgetMap.get(key) ?? 0;

    if (budget <= 0) return 0;

    const bucket = this.refill(key);
    return Math.min(bucket.tokens, budget);
  }

  /**
   * Check if we can proceed without blocking.
   */
  canProceed(exchange: string, category: EndpointCategory): boolean {
    const key = this.getKey(exchange, category);
    const bucket = this.refill(key);
    return bucket.tokens >= 1 && this.getBackoff(exchange, category) === 0;
  }

  /**
   * Reset rate limit state (for testing or recovery).
   */
  reset(exchange?: string, category?: EndpointCategory): void {
    if (exchange && category) {
      const key = this.getKey(exchange, category);
      this.buckets.delete(key);
      this.backoffState.delete(key);
      this.budgetMap.delete(key);
    } else {
      this.buckets.clear();
      this.backoffState.clear();
      this.budgetMap.clear();
      this.wedgeWatchdog?.stop();
    }
  }
}

// Singleton
export const rateLimiter = new RateLimiter();
