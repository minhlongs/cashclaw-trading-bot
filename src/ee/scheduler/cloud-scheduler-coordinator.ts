// Step 12: 24/7 Cloud Scheduler Coordinator & Heartbeat Lease Manager
// Ensures self-hosted users who upgrade to Cloud SaaS get uninterrupted 24/7
// edge paper execution with zero double-tick collisions across worker isolates.

import { type Result, ok, err } from '../../lib/result';

export interface BotTickLease {
  readonly botId: string;
  readonly workspaceId: string;
  readonly isolateId: string;
  readonly epochMinute: number;
  readonly acquiredAtMs: number;
  readonly expiresAtMs: number;
}

export interface AcquireTickInput {
  readonly botId: string;
  readonly workspaceId: string;
  readonly isolateId: string;
  readonly nowMs: number;
  readonly leaseDurationMs?: number;
}

export class CloudSchedulerCoordinator {
  private readonly leases = new Map<string, BotTickLease>();

  public acquireTickLease(input: AcquireTickInput): Result<BotTickLease> {
    const leaseDurationMs = input.leaseDurationMs ?? 55_000;
    const epochMinute = Math.floor(input.nowMs / 60_000);
    const leaseKey = `${input.workspaceId}:${input.botId}:${epochMinute}`;

    const existing = this.leases.get(leaseKey);
    if (existing && existing.expiresAtMs > input.nowMs) {
      return err(
        `DUPLICATE_TICK_GUARD: Bot ${input.botId} already leased by isolate ${existing.isolateId} for minute ${epochMinute}`,
      );
    }

    const lease: BotTickLease = {
      botId: input.botId,
      workspaceId: input.workspaceId,
      isolateId: input.isolateId,
      epochMinute,
      acquiredAtMs: input.nowMs,
      expiresAtMs: input.nowMs + leaseDurationMs,
    };
    this.leases.set(leaseKey, lease);
    return ok(lease);
  }

  public activeLeaseCount(nowMs: number): number {
    let count = 0;
    for (const lease of this.leases.values()) {
      if (lease.expiresAtMs > nowMs) {
        count += 1;
      }
    }
    return count;
  }
}
