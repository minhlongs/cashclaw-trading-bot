import { type EndpointCategory, type TokenBucket, type BackoffEntry, type TryAcquireResult, getRateLimiterKey } from './types';
import { createBucketFromHeaders } from './token-bucket';
import { recordBackoffInMap, getBackoffFromMap, resetLimiterState, createWedgeWatchdog, getRemainingBudgetFromState } from './rate-limiter-state';
import { RateLimiterAcquireOps } from './rate-limiter-acquire-ops';
import { RateLimiterSyncOps } from './rate-limiter-sync-ops';

export class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private backoffState = new Map<string, BackoffEntry>();
  private budgetMap = new Map<string, number>();
  private wedgeWatchdog: ReturnType<typeof createWedgeWatchdog> | null = null;

  acquire(e: string, c: EndpointCategory, timeoutMs?: number): Promise<number> {
    return RateLimiterAcquireOps.execute(this.buckets, e, c, (ex, ca) => this.getBackoff(ex, ca), () => this.wedgeWatchdog?.poke(), timeoutMs);
  }
  tryAcquire(e: string, c: EndpointCategory): TryAcquireResult {
    return RateLimiterSyncOps.tryAcquire(this.buckets, e, c, (ex, ca) => this.getBackoff(ex, ca), () => this.wedgeWatchdog?.poke());
  }
  recordBackoff(e: string, c: EndpointCategory, mult = 2): void { recordBackoffInMap(this.backoffState, getRateLimiterKey(e, c), mult); }
  getBackoff(e: string, c: EndpointCategory): number { return getBackoffFromMap(this.backoffState, getRateLimiterKey(e, c)); }
  setBudget(e: string, c: EndpointCategory, rpm: number, _rph: number): void { this.budgetMap.set(getRateLimiterKey(e, c), rpm); }
  updateFromHeaders(e: string, c: EndpointCategory, h: Headers): void {
    const p = createBucketFromHeaders(h);
    if (p !== null) this.buckets.set(getRateLimiterKey(e, c), p);
  }
  initWedgeWatchdog(cb: (e: string, c: EndpointCategory) => void): void { this.wedgeWatchdog = createWedgeWatchdog(this.buckets, this.backoffState, cb); }
  getRemainingBudget(e: string, c: EndpointCategory): number { return getRemainingBudgetFromState(this.buckets, this.budgetMap, getRateLimiterKey(e, c)); }
  canProceed(e: string, c: EndpointCategory): boolean { return RateLimiterSyncOps.canProceed(this.buckets, e, c, (ex, ca) => this.getBackoff(ex, ca)); }
  reset(e?: string, c?: EndpointCategory): void {
    const key = e && c ? getRateLimiterKey(e, c) : undefined;
    resetLimiterState(this.buckets, this.backoffState, this.budgetMap, key);
    if (!key) this.wedgeWatchdog?.stop();
  }
}
export const rateLimiter = new RateLimiter();
