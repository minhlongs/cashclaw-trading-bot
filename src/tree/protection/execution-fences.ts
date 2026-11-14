/**
 * Deterministic operational execution fences:
 * - Atomic webhook/fill batch idempotency deduplicator
 * - Single-writer scheduler lease coordinator
 * - Runaway tick execution call-count budget guard
 */

export interface FillWebhookEvent {
  readonly venueId: string;
  readonly orderId: string;
  readonly fillId: string;
  readonly symbol: string;
  readonly signedQuantity: number;
  readonly price: number;
  readonly feeUsd: number;
}

export interface BatchDeduplicationResult {
  readonly acceptedCount: number;
  readonly duplicateCount: number;
  readonly netPositionQty: number;
  readonly netNotionalUsd: number;
  readonly acceptedKeys: readonly string[];
}

export class AtomicFillDeduplicator {
  private readonly committedKeys = new Set<string>();
  private netPositionQty = 0;
  private netNotionalUsd = 0;

  public processBatchAtomically(events: readonly FillWebhookEvent[]): BatchDeduplicationResult {
    let acceptedCount = 0;
    let duplicateCount = 0;
    const acceptedKeys: string[] = [];

    for (const ev of events) {
      const idempotencyKey = `${ev.venueId}:${ev.orderId}:${ev.fillId}`;
      if (this.committedKeys.has(idempotencyKey)) {
        duplicateCount += 1;
        continue;
      }
      this.committedKeys.add(idempotencyKey);
      this.netPositionQty += ev.signedQuantity;
      this.netNotionalUsd += ev.signedQuantity * ev.price - ev.feeUsd;
      acceptedCount += 1;
      acceptedKeys.push(idempotencyKey);
    }

    return {
      acceptedCount,
      duplicateCount,
      netPositionQty: Number(this.netPositionQty.toFixed(8)),
      netNotionalUsd: Number(this.netNotionalUsd.toFixed(2)),
      acceptedKeys,
    };
  }
}

export interface LeaseGrantResult {
  readonly acquired: boolean;
  readonly holderWorkerId: string;
  readonly fencingToken: number;
  readonly expiresAtMs: number;
}

export class DeterministicLeaseCoordinator {
  private holderId: string | null = null;
  private expiresAtMs = 0;
  private fencingToken = 0;

  public acquireLease(workerId: string, nowMs: number, ttlMs: number): LeaseGrantResult {
    if (this.holderId !== null && this.holderId !== workerId && nowMs < this.expiresAtMs) {
      return {
        acquired: false,
        holderWorkerId: this.holderId,
        fencingToken: this.fencingToken,
        expiresAtMs: this.expiresAtMs,
      };
    }
    this.holderId = workerId;
    this.fencingToken += 1;
    this.expiresAtMs = nowMs + Math.max(1, ttlMs);
    return {
      acquired: true,
      holderWorkerId: workerId,
      fencingToken: this.fencingToken,
      expiresAtMs: this.expiresAtMs,
    };
  }
}

export class ExecutionBudgetGuard {
  private callCount = 0;
  private aborted = false;

  public constructor(private readonly maxCallsPerTick: number) {}

  public consumeStep(): { allowed: boolean; callCount: number; aborted: boolean } {
    this.callCount += 1;
    if (this.callCount > this.maxCallsPerTick) {
      this.aborted = true;
      return { allowed: false, callCount: this.callCount, aborted: true };
    }
    return { allowed: true, callCount: this.callCount, aborted: false };
  }

  public getCallCount(): number {
    return this.callCount;
  }

  public isAborted(): boolean {
    return this.aborted;
  }
}
