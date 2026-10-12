import { RateLimitExecutionTimeout } from './errors';
import { type EndpointCategory, type TokenBucket, getRateLimiterKey } from './types';
import { calculateWaitTime } from './token-bucket';
import { refillBucketInMap } from './rate-limiter-state';

export class RateLimiterAcquireOps {
  public static execute(
    buckets: Map<string, TokenBucket>, exchange: string, category: EndpointCategory,
    getBackoff: (e: string, c: EndpointCategory) => number, onPoke?: () => void, timeoutMs?: number
  ): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const key = getRateLimiterKey(exchange, category);
      const bucket = refillBucketInMap(buckets, key);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => { if (timer !== undefined) clearTimeout(timer); };
      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          cleanup();
          reject(new RateLimitExecutionTimeout(`Rate limit acquire timed out after ${timeoutMs}ms`, timeoutMs));
        }, timeoutMs);
      }
      if (bucket.tokens >= 1 && getBackoff(exchange, category) === 0) {
        cleanup(); bucket.tokens -= 1; onPoke?.(); resolve(0);
      } else {
        const waitMs = calculateWaitTime(bucket, getBackoff(exchange, category));
        setTimeout(() => {
          cleanup();
          const refreshed = refillBucketInMap(buckets, key);
          refreshed.tokens = Math.max(0, refreshed.tokens - 1);
          onPoke?.(); resolve(waitMs);
        }, waitMs + 50);
      }
    });
  }
}
