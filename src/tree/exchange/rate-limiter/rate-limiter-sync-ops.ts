import { type EndpointCategory, type TokenBucket, type TryAcquireResult, getRateLimiterKey } from './types';
import { refillBucketInMap } from './rate-limiter-state';

export class RateLimiterSyncOps {
  public static tryAcquire(
    buckets: Map<string, TokenBucket>, exchange: string, category: EndpointCategory,
    getBackoff: (e: string, c: EndpointCategory) => number, onPoke?: () => void
  ): TryAcquireResult {
    const key = getRateLimiterKey(exchange, category);
    const bucket = refillBucketInMap(buckets, key);
    const backoff = getBackoff(exchange, category);
    if (bucket.tokens >= 1 && backoff === 0) {
      bucket.tokens -= 1;
      onPoke?.();
      return { allowed: true };
    }
    return { allowed: false, waitMs: Math.max(50, Math.ceil(backoff) + 100) };
  }

  public static canProceed(
    buckets: Map<string, TokenBucket>, exchange: string, category: EndpointCategory,
    getBackoff: (e: string, c: EndpointCategory) => number
  ): boolean {
    const key = getRateLimiterKey(exchange, category);
    const bucket = refillBucketInMap(buckets, key);
    return bucket.tokens >= 1 && getBackoff(exchange, category) === 0;
  }
}
