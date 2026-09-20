// Private state helpers for RateLimiter — bucket refill, backoff, and watchdog encapsulation.
import {
  DEFAULT_LIMITS,
  FALLBACK_LIMIT,
  type BackoffEntry,
  type EndpointCategory,
  type TokenBucket,
} from './types';
import { refillBucket } from './token-bucket';
import { calculateNextBackoff, calculateRemainingBackoff } from './backoff';
import { WedgeWatchdog } from './wedge-watchdog';

export type BucketMap = Map<string, TokenBucket>;
export type BackoffMap = Map<string, BackoffEntry>;
export type BudgetMap = Map<string, number>;

export function refillBucketInMap(
  buckets: BucketMap,
  key: string,
): TokenBucket {
  const limit = DEFAULT_LIMITS[key] ?? FALLBACK_LIMIT;
  let bucket = buckets.get(key);
  bucket = refillBucket(bucket, limit, Date.now());
  if (!buckets.has(key)) {
    buckets.set(key, bucket);
  }
  return bucket;
}

export function recordBackoffInMap(
  backoffState: BackoffMap,
  key: string,
  multiplier = 2,
): void {
  const existing = backoffState.get(key);
  backoffState.set(key, calculateNextBackoff(existing, multiplier, Date.now()));
}

export function getBackoffFromMap(
  backoffState: BackoffMap,
  key: string,
): number {
  const state = backoffState.get(key);
  const { remaining, isExpired } = calculateRemainingBackoff(state, Date.now());
  if (isExpired && state) {
    backoffState.delete(key);
  }
  return remaining;
}

export function resetLimiterState(
  buckets: BucketMap,
  backoffState: BackoffMap,
  budgetMap: BudgetMap,
  key?: string,
): void {
  if (key) {
    buckets.delete(key);
    backoffState.delete(key);
    budgetMap.delete(key);
  } else {
    buckets.clear();
    backoffState.clear();
    budgetMap.clear();
  }
}

export function createWedgeWatchdog(
  buckets: BucketMap,
  backoffState: BackoffMap,
  onWedge: (exchange: string, category: EndpointCategory) => void,
): WedgeWatchdog {
  const watchdog = new WedgeWatchdog();
  watchdog.start(() => {
    for (const key of buckets.keys()) {
      const [exchange, category] = key.split(':') as [string, EndpointCategory];
      buckets.delete(key);
      backoffState.delete(key);
      onWedge(exchange, category);
    }
  });
  return watchdog;
}

export function getRemainingBudgetFromState(
  buckets: BucketMap,
  budgetMap: BudgetMap,
  key: string,
): number {
  const budget = budgetMap.get(key) ?? 0;
  if (budget <= 0) return 0;
  const bucket = refillBucketInMap(buckets, key);
  return Math.min(bucket.tokens, budget);
}
