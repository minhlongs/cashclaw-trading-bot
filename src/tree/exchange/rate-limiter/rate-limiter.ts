import { RateLimitExecutionTimeout } from './errors';
import {
  type EndpointCategory,
  type TokenBucket,
  type BackoffEntry,
  type TryAcquireResult,
  getRateLimiterKey,
} from './types';
import { calculateWaitTime, createBucketFromHeaders } from './token-bucket';
import {
  refillBucketInMap,
  recordBackoffInMap,
  getBackoffFromMap,
  resetLimiterState,
  createWedgeWatchdog,
  getRemainingBudgetFromState,
} from './rate-limiter-state';

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private backoffState = new Map<string, BackoffEntry>();
  private budgetMap = new Map<string, number>();
  private wedgeWatchdog: ReturnType<typeof createWedgeWatchdog> | null = null;

  acquire(exchange: string, category: EndpointCategory, timeoutMs?: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const key = getRateLimiterKey(exchange, category);
      const bucket = refillBucketInMap(this.buckets, key);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => { if (timer !== undefined) clearTimeout(timer); };

      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          cleanup();
          reject(new RateLimitExecutionTimeout(`Rate limit acquire timed out after ${timeoutMs}ms`, timeoutMs));
        }, timeoutMs);
      }

      if (bucket.tokens >= 1 && this.getBackoff(exchange, category) === 0) {
        cleanup();
        bucket.tokens -= 1;
        this.wedgeWatchdog?.poke();
        resolve(0);
      } else {
        const waitMs = calculateWaitTime(bucket, this.getBackoff(exchange, category));
        setTimeout(() => {
          cleanup();
          const refreshed = refillBucketInMap(this.buckets, key);
          refreshed.tokens = Math.max(0, refreshed.tokens - 1);
          this.wedgeWatchdog?.poke();
          resolve(waitMs);
        }, waitMs + 50);
      }
    });
  }

  tryAcquire(exchange: string, category: EndpointCategory): TryAcquireResult {
    const key = getRateLimiterKey(exchange, category);
    const bucket = refillBucketInMap(this.buckets, key);
    const backoffRemaining = this.getBackoff(exchange, category);

    if (bucket.tokens >= 1 && backoffRemaining === 0) {
      bucket.tokens -= 1;
      this.wedgeWatchdog?.poke();
      return { allowed: true };
    }

    return {
      allowed: false,
      waitMs: Math.max(50, Math.ceil(backoffRemaining) + 100),
    };
  }

  recordBackoff(exchange: string, category: EndpointCategory, multiplier = 2): void {
    recordBackoffInMap(this.backoffState, getRateLimiterKey(exchange, category), multiplier);
  }

  getBackoff(exchange: string, category: EndpointCategory): number {
    return getBackoffFromMap(this.backoffState, getRateLimiterKey(exchange, category));
  }

  setBudget(exchange: string, category: EndpointCategory, reqPerMin: number, _reqPerHour: number): void {
    this.budgetMap.set(getRateLimiterKey(exchange, category), reqPerMin);
  }

  updateFromHeaders(exchange: string, category: EndpointCategory, headers: Headers): void {
    const parsed = createBucketFromHeaders(headers);
    if (parsed !== null) {
      this.buckets.set(getRateLimiterKey(exchange, category), parsed);
    }
  }

  initWedgeWatchdog(onWedge: (exchange: string, category: EndpointCategory) => void): void {
    this.wedgeWatchdog = createWedgeWatchdog(this.buckets, this.backoffState, onWedge);
  }

  getRemainingBudget(exchange: string, category: EndpointCategory): number {
    return getRemainingBudgetFromState(this.buckets, this.budgetMap, getRateLimiterKey(exchange, category));
  }

  canProceed(exchange: string, category: EndpointCategory): boolean {
    const key = getRateLimiterKey(exchange, category);
    const bucket = refillBucketInMap(this.buckets, key);
    return bucket.tokens >= 1 && this.getBackoff(exchange, category) === 0;
  }

  reset(exchange?: string, category?: EndpointCategory): void {
    const key = exchange && category ? getRateLimiterKey(exchange, category) : undefined;
    resetLimiterState(this.buckets, this.backoffState, this.budgetMap, key);
    if (!key) {
      this.wedgeWatchdog?.stop();
    }
  }
}

export const rateLimiter = new RateLimiter();
