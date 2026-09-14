import { TokenBucket, RateLimitConfig } from './types';
import { parseRateLimitHeaders } from './headers';

export function refillBucket(
  bucket: TokenBucket | undefined,
  limit: RateLimitConfig,
  now: number = Date.now()
): TokenBucket {
  if (!bucket) {
    return { tokens: limit.capacity, lastRefill: now };
  }

  const elapsed = now - bucket.lastRefill;
  if (elapsed > 0) {
    const refills = Math.floor(elapsed / limit.refillMs);
    if (refills > 0) {
      bucket.tokens = Math.min(
        limit.capacity,
        bucket.tokens + refills * limit.capacity
      );
      bucket.lastRefill = now;
    }
  }

  return bucket;
}

export function consumeToken(bucket: TokenBucket): boolean {
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

export function calculateWaitTime(bucket: TokenBucket, backoffMs: number): number {
  const tokenWait = bucket.tokens < 1 ? 100 : 0;
  return tokenWait + Math.max(0, backoffMs);
}

export function createBucketFromHeaders(headers: Headers): TokenBucket | null {
  const parsed = parseRateLimitHeaders(headers);
  if (parsed === null) return null;

  return {
    tokens: parsed.remaining,
    lastRefill: parsed.resetAt,
  };
}
