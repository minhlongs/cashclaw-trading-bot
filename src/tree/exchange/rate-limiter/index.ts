// Rate Limiter — per-exchange, per-endword token bucket
// CF Workers constraint: respect exchange rate limits to avoid HTTP 429

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const DEFAULT_LIMITS: Record<string, { capacity: number; refillMs: number }> = {
  'binance:api': { capacity: 1200, refillMs: 60000 },  // 1200 req/min
  'binance:order': { capacity: 50, refillMs: 10000 },  // 50 req/10s
  'binance:ws': { capacity: 200, refillMs: 60000 },
  'bybit:api': { capacity: 120, refillMs: 1000 },      // 120 req/s
  'bybit:order': { capacity: 20, refillMs: 1000 },
  'bybit:ws': { capacity: 200, refillMs: 60000 },
  'okx:api': { capacity: 20, refillMs: 2000 },         // 20 req/2s
  'okx:order': { capacity: 20, refillMs: 1000 },
  'okx:ws': { capacity: 200, refillMs: 60000 },
};

type EndpointCategory = 'api' | 'order' | 'ws';

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();

  private getKey(exchange: string, category: EndpointCategory): string {
    return `${exchange}:${category}`;
  }

  private ensureBucket(key: string): TokenBucket {
    const limits = DEFAULT_LIMITS[key] || { capacity: 100, refillMs: 60000 };
    const existing = this.buckets.get(key);
    if (existing) return existing;

    const bucket: TokenBucket = {
      tokens: limits.capacity,
      lastRefill: Date.now(),
    };
    this.buckets.set(key, bucket);
    return bucket;
  }

  private refill(bucket: TokenBucket, capacity: number, refillMs: number): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    if (elapsed >= refillMs) {
      bucket.tokens = capacity;
      bucket.lastRefill = now;
    } else {
      bucket.tokens = Math.min(capacity, bucket.tokens + (elapsed / refillMs) * capacity);
      bucket.lastRefill = now;
    }
  }

  /**
   * Wait until a token is available, then consume it.
   * Returns the delay in ms (0 if no wait needed).
   */
  async acquire(exchange: string, category: EndpointCategory = 'api'): Promise<number> {
    const key = this.getKey(exchange, category);
    const limits = DEFAULT_LIMITS[key] || { capacity: 100, refillMs: 60000 };
    const bucket = this.ensureBucket(key);
    this.refill(bucket, limits.capacity, limits.refillMs);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return 0;
    }

    // Calculate wait time until next token
    const tokensNeeded = 1 - bucket.tokens;
    const waitMs = (tokensNeeded / limits.capacity) * limits.refillMs;

    // Minimum sleep — use Cloudflare idle callback pattern
    await new Promise((resolve) => setTimeout(resolve, Math.ceil(waitMs)));

    bucket.tokens = Math.max(0, bucket.tokens - 1);
    return waitMs;
  }

  /**
   * Check if we can proceed without waiting.
   */
  canProceed(exchange: string, category: EndpointCategory = 'api'): boolean {
    const key = this.getKey(exchange, category);
    const limits = DEFAULT_LIMITS[key] || { capacity: 100, refillMs: 60000 };
    const bucket = this.ensureBucket(key);
    this.refill(bucket, limits.capacity, limits.refillMs);
    return bucket.tokens >= 1;
  }

  /**
   * Reset rate limit state (for testing or recovery).
   */
  reset(exchange?: string, category?: EndpointCategory): void {
    if (exchange && category) {
      this.buckets.delete(this.getKey(exchange, category));
    } else {
      this.buckets.clear();
    }
  }
}

// Singleton
export const rateLimiter = new RateLimiter();
