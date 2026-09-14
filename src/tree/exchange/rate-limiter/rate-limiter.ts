import { WedgeWatchdog } from './wedge-watchdog';
import { RateLimitExecutionTimeout } from './errors';
import {
  EndpointCategory, TokenBucket, BackoffEntry, TryAcquireResult,
  DEFAULT_LIMITS, FALLBACK_LIMIT, getRateLimiterKey,
} from './types';
import { refillBucket, calculateWaitTime, createBucketFromHeaders } from './token-bucket';
import { calculateNextBackoff, calculateRemainingBackoff } from './backoff';

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private backoffState = new Map<string, BackoffEntry>();
  private budgetMap = new Map<string, number>();
  private wedgeWatchdog: WedgeWatchdog | null = null;

  private getKey(exchange: string, category: EndpointCategory): string {
    return getRateLimiterKey(exchange, category);
  }

  private refill(key: string): TokenBucket {
    const limit = DEFAULT_LIMITS[key] ?? FALLBACK_LIMIT;
    let bucket = this.buckets.get(key);
    bucket = refillBucket(bucket, limit, Date.now());
    if (!this.buckets.has(key)) {
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  acquire(exchange: string, category: EndpointCategory, timeoutMs?: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const key = this.getKey(exchange, category);
      const bucket = this.refill(key);
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
          const refreshed = this.refill(key);
          refreshed.tokens = Math.max(0, refreshed.tokens - 1);
          this.wedgeWatchdog?.poke();
          resolve(waitMs);
        }, waitMs + 50);
      }
    });
  }

  tryAcquire(exchange: string, category: EndpointCategory): TryAcquireResult {
    const key = this.getKey(exchange, category);
    const bucket = this.refill(key);
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
    const key = this.getKey(exchange, category);
    const existing = this.backoffState.get(key);
    this.backoffState.set(key, calculateNextBackoff(existing, multiplier, Date.now()));
  }

  getBackoff(exchange: string, category: EndpointCategory): number {
    const key = this.getKey(exchange, category);
    const state = this.backoffState.get(key);
    const { remaining, isExpired } = calculateRemainingBackoff(state, Date.now());
    if (isExpired && state) {
      this.backoffState.delete(key);
    }
    return remaining;
  }

  setBudget(exchange: string, category: EndpointCategory, reqPerMin: number, _reqPerHour: number): void {
    this.budgetMap.set(this.getKey(exchange, category), reqPerMin);
  }

  updateFromHeaders(exchange: string, category: EndpointCategory, headers: Headers): void {
    const parsed = createBucketFromHeaders(headers);
    if (parsed !== null) {
      this.buckets.set(this.getKey(exchange, category), parsed);
    }
  }

  initWedgeWatchdog(onWedge: (exchange: string, category: EndpointCategory) => void): void {
    this.wedgeWatchdog = new WedgeWatchdog();
    this.wedgeWatchdog.start(() => {
      for (const key of this.buckets.keys()) {
        const [exchange, category] = key.split(':') as [string, EndpointCategory];
        this.buckets.delete(key);
        this.backoffState.delete(key);
        onWedge(exchange, category);
      }
    });
  }

  getRemainingBudget(exchange: string, category: EndpointCategory): number {
    const key = this.getKey(exchange, category);
    const budget = this.budgetMap.get(key) ?? 0;
    if (budget <= 0) return 0;
    const bucket = this.refill(key);
    return Math.min(bucket.tokens, budget);
  }

  canProceed(exchange: string, category: EndpointCategory): boolean {
    const key = this.getKey(exchange, category);
    const bucket = this.refill(key);
    return bucket.tokens >= 1 && this.getBackoff(exchange, category) === 0;
  }

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

export const rateLimiter = new RateLimiter();
