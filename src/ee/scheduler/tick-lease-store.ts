// Durable tick-lease store for the cloud scheduler coordinator.
// The in-memory CloudSchedulerCoordinator cannot coordinate across worker isolates and loses all
// leases on restart; production scheduling must use createD1TickLeaseStore so the "24/7 durable"
// claim is backed by D1 state. Semantics are identical to the memory coordinator: one lease per
// workspace/bot/epoch-minute, duplicate-tick guard, and takeover of EXPIRED leases only.

import type { D1Database } from '@/lib/db/types';
import { type Result, ok, err } from '../../lib/result';

export interface TickLease {
  readonly botId: string;
  readonly workspaceId: string;
  readonly isolateId: string;
  readonly epochMinute: number;
  readonly acquiredAtMs: number;
  readonly expiresAtMs: number;
}

export interface AcquireTickLeaseInput {
  readonly botId: string;
  readonly workspaceId: string;
  readonly isolateId: string;
  readonly nowMs: number;
  readonly leaseDurationMs?: number;
}

export interface TickLeaseStore {
  acquireTickLease(input: AcquireTickLeaseInput): Promise<Result<TickLease>>;
  activeLeaseCount(nowMs: number, workspaceId?: string): Promise<number>;
}

export const DEFAULT_LEASE_DURATION_MS = 55_000;

export function epochMinuteOf(nowMs: number): number {
  return Math.floor(nowMs / 60_000);
}

export function duplicateTickGuard(botId: string, isolateId: string, epochMinute: number): string {
  return `DUPLICATE_TICK_GUARD: Bot ${botId} already leased by isolate ${isolateId} for minute ${epochMinute}`;
}

export function createMemoryTickLeaseStore(): TickLeaseStore {
  const leases = new Map<string, TickLease>();
  return {
    async acquireTickLease(input) {
      const nowMs = input.nowMs;
      for (const [key, lease] of leases) {
        if (lease.expiresAtMs <= nowMs) leases.delete(key);
      }
      const epochMinute = epochMinuteOf(nowMs);
      const leaseKey = `${input.workspaceId}:${input.botId}:${epochMinute}`;
      const existing = leases.get(leaseKey);
      if (existing && existing.expiresAtMs > nowMs) {
        return err(duplicateTickGuard(input.botId, existing.isolateId, epochMinute));
      }
      const lease: TickLease = {
        botId: input.botId,
        workspaceId: input.workspaceId,
        isolateId: input.isolateId,
        epochMinute,
        acquiredAtMs: nowMs,
        expiresAtMs: nowMs + (input.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS),
      };
      leases.set(leaseKey, lease);
      return ok(lease);
    },
    async activeLeaseCount(nowMs, workspaceId) {
      for (const [key, lease] of leases) {
        if (lease.expiresAtMs <= nowMs) leases.delete(key);
      }
      let count = 0;
      for (const lease of leases.values()) {
        if (lease.expiresAtMs > nowMs && (!workspaceId || lease.workspaceId === workspaceId)) count += 1;
      }
      return count;
    },
  };
}

type LeaseRow = {
  workspace_id: string; bot_id: string; epoch_minute: number;
  isolate_id: string; acquired_at_ms: number; expires_at_ms: number;
};

export function createD1TickLeaseStore(db: D1Database): TickLeaseStore {
  return {
    async acquireTickLease(input) {
      const nowMs = input.nowMs;
      const epochMinute = epochMinuteOf(nowMs);
      const leaseDurationMs = input.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
      const expiresAtMs = nowMs + leaseDurationMs;
      // INSERT OR IGNORE + RETURNING: a PK conflict returns no row (portable "no rows changed"
      // detection across D1, the local adapter and the wrangler CLI, which does not report
      // meta.changes). Exactly-one-row semantics are asserted through RETURNING everywhere.
      const inserted = await db.prepare(
        `INSERT OR IGNORE INTO saas_bot_tick_leases (workspace_id, bot_id, epoch_minute, isolate_id, acquired_at_ms, expires_at_ms)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING workspace_id`,
      ).bind(input.workspaceId, input.botId, epochMinute, input.isolateId, nowMs, expiresAtMs).first<{ workspace_id: string }>();
      if (inserted) return ok({ ...input, epochMinute, acquiredAtMs: nowMs, expiresAtMs });
      // PK conflict: allow takeover only when the existing lease has EXPIRED, and require the
      // guarded UPDATE to land exactly one row so a concurrent takeover can never double-grant.
      const existing = await db.prepare(
        `SELECT * FROM saas_bot_tick_leases WHERE workspace_id = ? AND bot_id = ? AND epoch_minute = ?`,
      ).bind(input.workspaceId, input.botId, epochMinute).first<LeaseRow>();
      if (!existing) return err(duplicateTickGuard(input.botId, input.isolateId, epochMinute));
      if (existing.expires_at_ms > nowMs) {
        return err(duplicateTickGuard(input.botId, existing.isolate_id, epochMinute));
      }
      const takeover = await db.prepare(
        `UPDATE saas_bot_tick_leases SET isolate_id = ?, acquired_at_ms = ?, expires_at_ms = ?
         WHERE workspace_id = ? AND bot_id = ? AND epoch_minute = ? AND expires_at_ms <= ?
         RETURNING workspace_id`,
      ).bind(input.isolateId, nowMs, expiresAtMs, input.workspaceId, input.botId, epochMinute, nowMs).first<{ workspace_id: string }>();
      if (!takeover) {
        return err(duplicateTickGuard(input.botId, input.isolateId, epochMinute));
      }
      return ok({ ...input, epochMinute, acquiredAtMs: nowMs, expiresAtMs });
    },
    async activeLeaseCount(nowMs, workspaceId) {
      const row = workspaceId === undefined
        ? await db.prepare(`SELECT COUNT(*) AS n FROM saas_bot_tick_leases WHERE expires_at_ms > ?`)
            .bind(nowMs).first<{ n: number }>()
        : await db.prepare(`SELECT COUNT(*) AS n FROM saas_bot_tick_leases WHERE expires_at_ms > ? AND workspace_id = ?`)
            .bind(nowMs, workspaceId).first<{ n: number }>();
      return row?.n ?? 0;
    },
  };
}
