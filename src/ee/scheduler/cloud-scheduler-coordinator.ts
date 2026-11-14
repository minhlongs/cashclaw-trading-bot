// Step 12 & Gate G10: 24/7 Cloud Scheduler Coordinator, Atomic D1 CAS Leases,
// Monotonic Fencing Tokens & ExecutionBudgetGuard.

import { type Result, ok, err } from '../../lib/result';
import {
  D1LeaseStore,
  ExecutionBudgetGuard,
  type ExecutionBudgetConfig,
  type LeaseD1DatabaseLike,
} from './d1-lease-store';

export type {
  DurableBotLeaseRecord,
  DurableLeaseInput,
  ExecutionBudgetConfig,
  ExecutionBudgetSnapshot,
  LeaseD1DatabaseLike,
  LeaseD1PreparedStatementLike,
} from './d1-lease-store';

export interface BotTickLease {
  readonly botId: string;
  readonly workspaceId: string;
  readonly isolateId: string;
  readonly epochMinute: number;
  readonly fencingToken: number;
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
  private readonly fencingTokens = new Map<string, number>();
  private leaseStore?: D1LeaseStore;

  public constructor(db?: LeaseD1DatabaseLike) {
    if (db) this.leaseStore = new D1LeaseStore(db);
  }

  public setDatabase(db?: LeaseD1DatabaseLike): void {
    this.leaseStore = db ? new D1LeaseStore(db) : undefined;
  }

  public createExecutionBudgetGuard(config?: ExecutionBudgetConfig): ExecutionBudgetGuard {
    return new ExecutionBudgetGuard(config);
  }

  public pruneExpiredLeases(nowMs: number): number {
    let pruned = 0;
    for (const [key, lease] of this.leases.entries()) {
      if (lease.expiresAtMs <= nowMs) {
        this.leases.delete(key);
        pruned += 1;
      }
    }
    return pruned;
  }

  public acquireTickLease(input: AcquireTickInput): Result<BotTickLease> {
    this.pruneExpiredLeases(input.nowMs);
    const leaseDurationMs = input.leaseDurationMs ?? 55_000;
    const epochMinute = Math.floor(input.nowMs / 60_000);
    const leaseKey = `${input.workspaceId}:${input.botId}:${epochMinute}`;

    const existing = this.leases.get(leaseKey);
    if (existing && existing.expiresAtMs > input.nowMs) {
      return err(
        `DUPLICATE_TICK_GUARD: Bot ${input.botId} already leased by isolate ${existing.isolateId} for minute ${epochMinute}`,
      );
    }

    const botScope = `${input.workspaceId}:${input.botId}`;
    const nextToken = (this.fencingTokens.get(botScope) ?? 0) + 1;
    this.fencingTokens.set(botScope, nextToken);

    const lease: BotTickLease = {
      botId: input.botId,
      workspaceId: input.workspaceId,
      isolateId: input.isolateId,
      epochMinute,
      fencingToken: nextToken,
      acquiredAtMs: input.nowMs,
      expiresAtMs: input.nowMs + leaseDurationMs,
    };
    this.leases.set(leaseKey, lease);
    return ok(lease);
  }

  public async acquireDurableTickLease(
    input: AcquireTickInput,
    dbOverride?: LeaseD1DatabaseLike,
  ): Promise<Result<BotTickLease>> {
    const store = dbOverride ? new D1LeaseStore(dbOverride) : this.leaseStore;
    if (!store) return err('DURABLE_LEASE_STORE_UNCONFIGURED: D1 database required');
    const casRes = await store.acquireCasLease(input);
    if (!casRes.ok) return casRes;

    const botScope = `${input.workspaceId}:${input.botId}`;
    const prev = this.fencingTokens.get(botScope) ?? 0;
    this.fencingTokens.set(botScope, Math.max(prev, casRes.data.fencingToken));
    const leaseKey = `${input.workspaceId}:${input.botId}:${casRes.data.epochMinute}`;
    this.leases.set(leaseKey, casRes.data);
    return ok(casRes.data);
  }

  public async releaseDurableTickLease(
    botId: string,
    isolateId: string,
    fencingToken: number,
    nowMs: number,
    dbOverride?: LeaseD1DatabaseLike,
  ): Promise<Result<boolean>> {
    const store = dbOverride ? new D1LeaseStore(dbOverride) : this.leaseStore;
    if (!store) return err('DURABLE_LEASE_STORE_UNCONFIGURED: D1 database required');
    return store.releaseCasLease(botId, isolateId, fencingToken, nowMs);
  }

  public validateFencingToken(workspaceId: string, botId: string, token: number): Result<true> {
    const current = this.fencingTokens.get(`${workspaceId}:${botId}`) ?? 0;
    if (token < current) {
      return err(`STALE_FENCING_TOKEN: token ${token} < active ${current}`);
    }
    return ok(true);
  }

  public activeLeaseCount(nowMs: number, workspaceId?: string): number {
    this.pruneExpiredLeases(nowMs);
    let count = 0;
    for (const lease of this.leases.values()) {
      if (lease.expiresAtMs > nowMs && (!workspaceId || lease.workspaceId === workspaceId)) {
        count += 1;
      }
    }
    return count;
  }

  public clearLeases(): void {
    this.leases.clear();
    this.fencingTokens.clear();
  }
}

export const defaultCloudSchedulerCoordinator = new CloudSchedulerCoordinator();
