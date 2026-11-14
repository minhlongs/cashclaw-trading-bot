// Gate G10: Durable D1 Conditional CAS Bot Lease Store & ExecutionBudgetGuard.

import { ok, err, type Result } from '../../lib/result';

export interface LeaseD1PreparedStatementLike {
  bind(...values: unknown[]): LeaseD1PreparedStatementLike;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface LeaseD1DatabaseLike {
  prepare(query: string): LeaseD1PreparedStatementLike;
}

export interface DurableLeaseInput {
  readonly botId: string;
  readonly workspaceId: string;
  readonly isolateId: string;
  readonly nowMs: number;
  readonly leaseDurationMs?: number;
}

export interface DurableBotLeaseRecord {
  readonly botId: string;
  readonly workspaceId: string;
  readonly isolateId: string;
  readonly epochMinute: number;
  readonly fencingToken: number;
  readonly acquiredAtMs: number;
  readonly expiresAtMs: number;
}

const ACQUIRE_CAS_LEASE_SQL = `
  INSERT INTO scheduler_bot_leases (
    bot_id, workspace_id, holder_id, fencing_token, acquired_at_ms, expires_at_ms
  ) VALUES (?2, ?3, ?4, 1, ?1, ?5)
  ON CONFLICT(bot_id) DO UPDATE SET
    workspace_id = excluded.workspace_id,
    holder_id = excluded.holder_id,
    acquired_at_ms = excluded.acquired_at_ms,
    expires_at_ms = excluded.expires_at_ms,
    fencing_token = scheduler_bot_leases.fencing_token + 1
  WHERE scheduler_bot_leases.expires_at_ms <= ?1
`;

const SELECT_LEASE_BY_BOT_SQL = `
  SELECT bot_id, workspace_id, holder_id, fencing_token, acquired_at_ms, expires_at_ms
    FROM scheduler_bot_leases WHERE bot_id = ?1
`;

const RELEASE_LEASE_FENCED_SQL = `
  UPDATE scheduler_bot_leases SET expires_at_ms = ?1
   WHERE bot_id = ?2 AND holder_id = ?3 AND fencing_token = ?4 AND expires_at_ms > ?1
`;

interface LeaseRow {
  bot_id: string;
  workspace_id: string;
  holder_id: string;
  fencing_token: number;
  acquired_at_ms: number;
  expires_at_ms: number;
}

export class D1LeaseStore {
  private readonly db: LeaseD1DatabaseLike;

  public constructor(db: LeaseD1DatabaseLike) {
    this.db = db;
  }

  public async acquireCasLease(input: DurableLeaseInput): Promise<Result<DurableBotLeaseRecord>> {
    try {
      const expiresAtMs = input.nowMs + (input.leaseDurationMs ?? 55_000);
      const epochMinute = Math.floor(input.nowMs / 60_000);
      const writeRes = await this.db
        .prepare(ACQUIRE_CAS_LEASE_SQL)
        .bind(input.nowMs, input.botId, input.workspaceId, input.isolateId, expiresAtMs)
        .run();
      const row = await this.db.prepare(SELECT_LEASE_BY_BOT_SQL).bind(input.botId).first<LeaseRow>();

      if (writeRes.meta.changes === 0 || !row || row.holder_id !== input.isolateId) {
        const holder = row ? row.holder_id : 'unknown-isolate';
        return err(`DUPLICATE_TICK_GUARD: Bot ${input.botId} already leased by isolate ${holder}`);
      }
      return ok({
        botId: String(row.bot_id),
        workspaceId: String(row.workspace_id),
        isolateId: String(row.holder_id),
        epochMinute,
        fencingToken: Number(row.fencing_token),
        acquiredAtMs: Number(row.acquired_at_ms),
        expiresAtMs: Number(row.expires_at_ms),
      });
    } catch (e) {
      return err(`LEASE_D1_ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  public async releaseCasLease(
    botId: string, isolateId: string, fencingToken: number, nowMs: number,
  ): Promise<Result<boolean>> {
    try {
      const res = await this.db
        .prepare(RELEASE_LEASE_FENCED_SQL)
        .bind(nowMs, botId, isolateId, fencingToken)
        .run();
      return ok(res.meta.changes > 0);
    } catch (e) {
      return err(`LEASE_D1_ERROR: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

export interface ExecutionBudgetConfig {
  readonly maxSubrequests?: number;
  readonly maxAdapterCalls?: number;
  readonly maxRecursionDepth?: number;
}

export interface ExecutionBudgetSnapshot {
  readonly subrequestsUsed: number;
  readonly maxSubrequests: number;
  readonly adapterCallsUsed: number;
  readonly maxAdapterCalls: number;
  readonly recursionDepth: number;
  readonly maxRecursionDepth: number;
  readonly tripped: boolean;
}

export class ExecutionBudgetGuard {
  private readonly maxSubrequests: number;
  private readonly maxAdapterCalls: number;
  private readonly maxRecursionDepth: number;
  private subrequestsUsed = 0;
  private adapterCallsUsed = 0;
  private recursionDepth = 0;
  private tripped = false;

  public constructor(config: ExecutionBudgetConfig = {}) {
    this.maxSubrequests = config.maxSubrequests ?? 40;
    this.maxAdapterCalls = config.maxAdapterCalls ?? 20;
    this.maxRecursionDepth = config.maxRecursionDepth ?? 3;
  }

  public isTripped(): boolean { return this.tripped; }

  public getSnapshot(): ExecutionBudgetSnapshot {
    return {
      subrequestsUsed: this.subrequestsUsed, maxSubrequests: this.maxSubrequests,
      adapterCallsUsed: this.adapterCallsUsed, maxAdapterCalls: this.maxAdapterCalls,
      recursionDepth: this.recursionDepth, maxRecursionDepth: this.maxRecursionDepth,
      tripped: this.tripped,
    };
  }

  public recordSubrequest(count = 1): Result<ExecutionBudgetSnapshot> {
    if (this.tripped || count <= 0 || this.subrequestsUsed + count > this.maxSubrequests) {
      this.tripped = true;
      return err(`EXECUTION_BUDGET_EXCEEDED: maxSubrequests (${this.maxSubrequests}) exceeded`);
    }
    this.subrequestsUsed += count;
    return ok(this.getSnapshot());
  }

  public recordAdapterCall(count = 1): Result<ExecutionBudgetSnapshot> {
    if (this.tripped || count <= 0 || this.adapterCallsUsed + count > this.maxAdapterCalls) {
      this.tripped = true;
      return err(`EXECUTION_BUDGET_EXCEEDED: maxAdapterCalls (${this.maxAdapterCalls}) exceeded`);
    }
    this.adapterCallsUsed += count;
    return this.recordSubrequest(count);
  }

  public async executeTick<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
    if (this.tripped || this.recursionDepth + 1 > this.maxRecursionDepth) {
      this.tripped = true;
      return err(`EXECUTION_BUDGET_EXCEEDED: maxRecursionDepth (${this.maxRecursionDepth}) exceeded`);
    }
    this.recursionDepth += 1;
    try {
      return ok(await fn());
    } catch (e) {
      return err(`TICK_EXECUTION_FAILED: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.recursionDepth -= 1;
    }
  }
}
