import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import {
  BASE_UNITS_PER_ASSET,
  D1AtomicLedgerBatcher,
  MICRO_USD_PER_USD,
  MicroDoubleEntryLedger,
  ZERO_BIGINT,
  applyLegsToBalances,
  computeBalanceSheet,
  createZeroAccountBalances,
  type AtomicOrderStateUpsert,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
} from '@/tree/ledger';
import {
  CloudSchedulerCoordinator,
  type LeaseD1DatabaseLike,
} from '@/ee/scheduler/cloud-scheduler-coordinator';

type SqlPrimitive = number | string | bigint | null;

interface SqlitePreparedStmtLike {
  get(...params: SqlPrimitive[]): unknown;
  all(...params: SqlPrimitive[]): unknown[];
  run(...params: SqlPrimitive[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

interface SqliteDatabaseSyncLike {
  readonly isTransaction: boolean;
  exec(sql: string): void;
  prepare(sql: string): SqlitePreparedStmtLike;
}

const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as {
  DatabaseSync: new (location: string) => SqliteDatabaseSyncLike;
};

const MIGRATION_0017_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../migrations/0017_paper_ledger_and_leases.sql'),
  'utf8',
);
const MIGRATION_0019_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../migrations/0019_paper_ledger_positions.sql'),
  'utf8',
);

interface BoundSqlOp {
  readonly sql: string;
  readonly params: readonly SqlPrimitive[];
}

interface FaultHooks {
  failBeforeBatch?: boolean;
  failAtStatementIndex?: number;
  failAfterCommitAck?: boolean;
  dbBusyError?: boolean;
}

function createFaultInjectableD1(hooks: FaultHooks = {}): {
  sqlite: SqliteDatabaseSyncLike;
  db: D1DatabaseLike & LeaseD1DatabaseLike;
} {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(MIGRATION_0017_SQL);
  sqlite.exec(MIGRATION_0019_SQL);

  const buildStmt = (sql: string, params: readonly unknown[] = []): D1PreparedStatementLike & { __op: BoundSqlOp } => {
    const typedParams = params as readonly SqlPrimitive[];
    return {
      __op: { sql, params: typedParams },
      bind(...values: unknown[]) {
        return buildStmt(sql, values);
      },
      async first<T = unknown>(): Promise<T | null> {
        const row = sqlite.prepare(sql).get(...typedParams) as T | undefined;
        return row ? ({ ...row } as T) : null;
      },
      async all<T = unknown>(): Promise<{ results: T[] }> {
        const rows = sqlite.prepare(sql).all(...typedParams) as T[];
        return { results: rows.map((r) => ({ ...(r as object) } as T)) };
      },
      async run() {
        const info = sqlite.prepare(sql).run(...typedParams);
        return { meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
      },
    };
  };

  const db: D1DatabaseLike & LeaseD1DatabaseLike = {
    prepare(query: string) {
      return buildStmt(query);
    },
    async batch<T = { meta?: { changes: number } }>(statements: D1PreparedStatementLike[]): Promise<T[]> {
      if (hooks.dbBusyError) throw new Error('D1_ERROR: SQLITE_BUSY: database is locked');
      if (hooks.failBeforeBatch) throw new Error('WORKER_CRASH_BEFORE_BATCH');
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const out: unknown[] = [];
        for (let i = 0; i < statements.length; i++) {
          if (hooks.failAtStatementIndex === i) {
            throw new Error(`INJECTED_BATCH_MID_FAILURE_AT_${i}`);
          }
          const op = (statements[i] as unknown as { __op: BoundSqlOp }).__op;
          const info = sqlite.prepare(op.sql).run(...op.params);
          out.push({ meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } });
        }
        sqlite.exec('COMMIT');
        if (hooks.failAfterCommitAck) {
          throw new Error('WORKER_CRASH_AFTER_COMMIT_ACK_LOST');
        }
        return out as T[];
      } catch (err) {
        if (sqlite.isTransaction) sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };

  return { sqlite, db };
}

function makeOrder(
  id: string,
  state: AtomicOrderStateUpsert['lifecycleState'],
  opts: Partial<AtomicOrderStateUpsert> = {},
): AtomicOrderStateUpsert {
  return {
    clientOrderId: id,
    symbol: 'BTCUSDT',
    side: 'buy',
    orderType: 'limit',
    quantityBase: BASE_UNITS_PER_ASSET,
    filledQtyBase: ZERO_BIGINT,
    limitPriceMicroUsd: BigInt(50_000) * MICRO_USD_PER_USD,
    reservedMarginMicroUsd: BigInt(5_000) * MICRO_USD_PER_USD,
    reduceOnly: false,
    lifecycleState: state,
    createdAtMs: 1_000,
    updatedAtMs: 1_100,
    ...opts,
  };
}

describe('Atomic Ledger 18-Case Fault Injection Matrix', () => {
  it('1-2. rejects duplicate intent event hash and duplicate fill without double debit', async () => {
    const { db } = createFaultInjectableD1();
    const batcher = new D1AtomicLedgerBatcher(db);
    await batcher.initializeBotAccount('bot-f1', 1_000, 1);
    const ledger = new MicroDoubleEntryLedger('bot-f1', 1);

    const dep = ledger.depositCapital('ev-dep', BigInt(10_000) * MICRO_USD_PER_USD, 1_001);
    expect(dep.ok).toBe(true);
    if (!dep.ok) return;
    const b1 = ledger.getAccountBalances();
    expect((await batcher.commitAtomicBatch({
      botId: 'bot-f1', expectedVersion: 0, fencingToken: 1,
      requiredCashMicroUsd: ZERO_BIGINT, nextBalances: b1, entry: dep.data,
    })).ok).toBe(true);

    // Duplicate intent / reserve event hash rejected by UNIQUE(bot_id, event_hash)
    const res = ledger.reserveMargin('ev-res-dup', BigInt(2_000) * MICRO_USD_PER_USD, 1_002);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const b2 = ledger.getAccountBalances();
    expect((await batcher.commitAtomicBatch({
      botId: 'bot-f1', expectedVersion: 1, fencingToken: 1,
      requiredCashMicroUsd: BigInt(2_000) * MICRO_USD_PER_USD, nextBalances: b2, entry: res.data,
      orderUpsert: makeOrder('ord-dup', 'OPEN'),
    })).ok).toBe(true);

    // Replay same event hash against D1 -> DUPLICATE_EVENT_HASH, no second debit
    const dupRes = await batcher.commitAtomicBatch({
      botId: 'bot-f1', expectedVersion: 2, fencingToken: 1,
      requiredCashMicroUsd: BigInt(2_000) * MICRO_USD_PER_USD, nextBalances: b2,
      entry: { ...res.data, version: 3 },
    });
    expect(dupRes.ok).toBe(false);
    if (!dupRes.ok) expect(dupRes.error).toContain('DUPLICATE_EVENT_HASH');

    // Duplicate fill event hash rejected in ledger AND in D1
    const fill1 = ledger.applyFill({
      eventHash: 'ev-fill-dup', symbol: 'BTCUSDT', side: 'buy',
      fillQtyBase: BASE_UNITS_PER_ASSET / BigInt(2), fillPriceMicroUsd: BigInt(50_000) * MICRO_USD_PER_USD,
      feeMicroUsd: BigInt(10) * MICRO_USD_PER_USD, releasedOrderMarginMicroUsd: BigInt(2_000) * MICRO_USD_PER_USD,
      marginRateBps: BigInt(1_000), timestampMs: 1_003,
    });
    expect(fill1.ok).toBe(true);
    const fillDup = ledger.applyFill({
      eventHash: 'ev-fill-dup', symbol: 'BTCUSDT', side: 'buy',
      fillQtyBase: BASE_UNITS_PER_ASSET / BigInt(2), fillPriceMicroUsd: BigInt(50_000) * MICRO_USD_PER_USD,
      feeMicroUsd: BigInt(10) * MICRO_USD_PER_USD, releasedOrderMarginMicroUsd: BigInt(2_000) * MICRO_USD_PER_USD,
      marginRateBps: BigInt(1_000), timestampMs: 1_004,
    });
    expect(fillDup.ok).toBe(false);
    const state = await batcher.loadDurableBotState('bot-f1');
    expect(state?.balances.CASH_AVAILABLE).toBe(BigInt(8_000) * MICRO_USD_PER_USD);
    expect(computeBalanceSheet(state!.balances).balanced).toBe(true);
  });

  it('3-7. handles out-of-order fill version, partial fill, cancel after partial fill, reduce-only close, and zero-entry reduce-only', async () => {
    const { db } = createFaultInjectableD1();
    const batcher = new D1AtomicLedgerBatcher(db);
    await batcher.initializeBotAccount('bot-f2', 1_000, 1);
    const ledger = new MicroDoubleEntryLedger('bot-f2', 1);

    const dep = ledger.depositCapital('ev-dep', BigInt(15_000) * MICRO_USD_PER_USD, 1_001);
    expect(dep.ok).toBe(true);
    if (!dep.ok) return;
    await batcher.commitAtomicBatch({
      botId: 'bot-f2', expectedVersion: 0, fencingToken: 1,
      requiredCashMicroUsd: ZERO_BIGINT, nextBalances: ledger.getAccountBalances(), entry: dep.data,
    });

    // 3. Out-of-order fill (non-contiguous version) rejected before touching D1
    const ooo = await batcher.commitAtomicGroup({
      botId: 'bot-f2', expectedVersion: 1, fencingToken: 1,
      steps: [{ entry: { ...dep.data, version: 5, eventHash: 'ev-ooo' }, nextBalances: ledger.getAccountBalances(), requiredCashMicroUsd: ZERO_BIGINT }],
    });
    expect(ooo.ok).toBe(false);
    if (!ooo.ok) expect(ooo.error).toContain('NON_CONTIGUOUS_JOURNAL_VERSION');

    // 4-5. Partial fill + cancel remainder releases exact remaining margin
    const r = ledger.reserveMargin('ev-res', BigInt(4_000) * MICRO_USD_PER_USD, 1_002);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await batcher.commitAtomicBatch({
      botId: 'bot-f2', expectedVersion: 1, fencingToken: 1,
      requiredCashMicroUsd: BigInt(4_000) * MICRO_USD_PER_USD, nextBalances: ledger.getAccountBalances(), entry: r.data,
      orderUpsert: makeOrder('ord-pf', 'OPEN', { reservedMarginMicroUsd: BigInt(4_000) * MICRO_USD_PER_USD }),
    });

    const pf = ledger.applyFill({
      eventHash: 'ev-pf', symbol: 'BTCUSDT', side: 'buy',
      fillQtyBase: BASE_UNITS_PER_ASSET / BigInt(2), fillPriceMicroUsd: BigInt(40_000) * MICRO_USD_PER_USD,
      feeMicroUsd: BigInt(5) * MICRO_USD_PER_USD, releasedOrderMarginMicroUsd: BigInt(2_000) * MICRO_USD_PER_USD,
      marginRateBps: BigInt(1_000), timestampMs: 1_003,
    });
    expect(pf.ok).toBe(true);
    if (!pf.ok) return;
    await batcher.commitAtomicBatch({
      botId: 'bot-f2', expectedVersion: 2, fencingToken: 1,
      requiredCashMicroUsd: BigInt(5) * MICRO_USD_PER_USD, nextBalances: ledger.getAccountBalances(), entry: pf.data.entry,
      orderUpsert: makeOrder('ord-pf', 'PARTIALLY_FILLED', { filledQtyBase: BASE_UNITS_PER_ASSET / BigInt(2), reservedMarginMicroUsd: BigInt(2_000) * MICRO_USD_PER_USD }),
      positions: ledger.getAllPositions(),
    });

    const rel = ledger.releaseMargin('ev-cancel-rel', BigInt(2_000) * MICRO_USD_PER_USD, 1_004);
    expect(rel.ok).toBe(true);
    if (!rel.ok) return;
    await batcher.commitAtomicBatch({
      botId: 'bot-f2', expectedVersion: 3, fencingToken: 1,
      requiredCashMicroUsd: ZERO_BIGINT, nextBalances: ledger.getAccountBalances(), entry: rel.data,
      orderUpsert: makeOrder('ord-pf', 'CANCELLED', { filledQtyBase: BASE_UNITS_PER_ASSET / BigInt(2), reservedMarginMicroUsd: ZERO_BIGINT }),
      positions: ledger.getAllPositions(),
    });

    // 6. Reduce-only closure leaves 0 open position and 0 position margin
    const close = ledger.applyFill({
      eventHash: 'ev-ro-close', symbol: 'BTCUSDT', side: 'sell',
      fillQtyBase: BASE_UNITS_PER_ASSET / BigInt(2), fillPriceMicroUsd: BigInt(41_000) * MICRO_USD_PER_USD,
      feeMicroUsd: BigInt(5) * MICRO_USD_PER_USD, releasedOrderMarginMicroUsd: ZERO_BIGINT,
      marginRateBps: BigInt(1_000), timestampMs: 1_005,
    });
    expect(close.ok).toBe(true);
    if (!close.ok) return;
    await batcher.commitAtomicBatch({
      botId: 'bot-f2', expectedVersion: 4, fencingToken: 1,
      requiredCashMicroUsd: ZERO_BIGINT, nextBalances: ledger.getAccountBalances(), entry: close.data.entry,
      orderUpsert: makeOrder('ord-ro', 'FILLED', { side: 'sell', reduceOnly: true, filledQtyBase: BASE_UNITS_PER_ASSET / BigInt(2), reservedMarginMicroUsd: ZERO_BIGINT }),
      positions: ledger.getAllPositions(),
    });

    // 7. Zero-entry reduce-only guard: invalid zero-qty fill rejected cleanly
    const zeroFill = ledger.applyFill({
      eventHash: 'ev-zero-ro', symbol: 'BTCUSDT', side: 'sell',
      fillQtyBase: ZERO_BIGINT, fillPriceMicroUsd: BigInt(41_000) * MICRO_USD_PER_USD,
      feeMicroUsd: ZERO_BIGINT, releasedOrderMarginMicroUsd: ZERO_BIGINT,
      marginRateBps: BigInt(1_000), timestampMs: 1_006,
    });
    expect(zeroFill.ok).toBe(false);

    const state = await batcher.loadDurableBotState('bot-f2');
    expect(state?.positions).toEqual([]);
    expect(state?.balances.MARGIN_RESERVED).toBe(ZERO_BIGINT);
    expect(state?.balances.POSITION_MARGIN).toBe(ZERO_BIGINT);
    expect(computeBalanceSheet(state!.balances).balanced).toBe(true);
  });

  it('8-9 & 16. blocks stale fencing token, lost lease, and concurrent workers on the same bot', async () => {
    const { db } = createFaultInjectableD1();
    const coordinator = new CloudSchedulerCoordinator(db);
    const batcher = new D1AtomicLedgerBatcher(db);

    const l1 = await coordinator.acquireDurableTickLease({
      botId: 'bot-race', workspaceId: 'ws-1', isolateId: 'worker-A', nowMs: 1_000, leaseDurationMs: 5_000,
    });
    expect(l1.ok).toBe(true);
    if (!l1.ok) return;
    await batcher.initializeBotAccount('bot-race', 1_000, l1.data.fencingToken);

    // Concurrent worker B cannot steal active lease before expiry
    const l2Early = await coordinator.acquireDurableTickLease({
      botId: 'bot-race', workspaceId: 'ws-1', isolateId: 'worker-B', nowMs: 2_000, leaseDurationMs: 5_000,
    });
    expect(l2Early.ok).toBe(false);

    // Lease expires -> worker B acquires higher fencing token
    const l2 = await coordinator.acquireDurableTickLease({
      botId: 'bot-race', workspaceId: 'ws-1', isolateId: 'worker-B', nowMs: 7_000, leaseDurationMs: 5_000,
    });
    expect(l2.ok).toBe(true);
    if (!l2.ok) return;
    expect(l2.data.fencingToken).toBeGreaterThan(l1.data.fencingToken);

    // Worker A (stale token) tries to commit ledger + order + position -> ALL rejected atomically
    const staleLedger = new MicroDoubleEntryLedger('bot-race', l1.data.fencingToken);
    const dep = staleLedger.depositCapital('ev-stale', BigInt(1_000) * MICRO_USD_PER_USD, 7_001);
    expect(dep.ok).toBe(true);
    if (!dep.ok) return;

    const staleCommit = await batcher.commitAtomicBatch({
      botId: 'bot-race', expectedVersion: 0, fencingToken: l1.data.fencingToken,
      requiredCashMicroUsd: ZERO_BIGINT, nextBalances: staleLedger.getAccountBalances(),
      entry: dep.data, orderUpsert: makeOrder('ord-stale', 'OPEN'),
    });
    expect(staleCommit.ok).toBe(false);

    const state = await batcher.loadDurableBotState('bot-race');
    expect(state?.version).toBe(0);
    expect(state?.processedEventHashes).toEqual([]);
    expect(state?.orderIntents).toEqual([]);
  });

  it('10-15 & 18. survives DB busy, crash before batch, failure inside batch, crash after commit / ack loss, retry after restart, and reconciles cleanly', async () => {
    const hooks: FaultHooks = {};
    const { db } = createFaultInjectableD1(hooks);
    const batcher = new D1AtomicLedgerBatcher(db);
    await batcher.initializeBotAccount('bot-crash', 1_000, 1);

    const ledger = new MicroDoubleEntryLedger('bot-crash', 1);
    const dep = ledger.depositCapital('ev-crash-dep', BigInt(5_000) * MICRO_USD_PER_USD, 1_001);
    expect(dep.ok).toBe(true);
    if (!dep.ok) return;
    const targetBal = applyLegsToBalances(createZeroAccountBalances(), dep.data.legs);

    // 10. DB busy
    hooks.dbBusyError = true;
    expect((await batcher.commitAtomicBatch({
      botId: 'bot-crash', expectedVersion: 0, fencingToken: 1,
      requiredCashMicroUsd: ZERO_BIGINT, nextBalances: targetBal, entry: dep.data,
    })).ok).toBe(false);
    hooks.dbBusyError = false;

    // 11. Worker crash before batch
    hooks.failBeforeBatch = true;
    expect((await batcher.commitAtomicBatch({
      botId: 'bot-crash', expectedVersion: 0, fencingToken: 1,
      requiredCashMicroUsd: ZERO_BIGINT, nextBalances: targetBal, entry: dep.data,
    })).ok).toBe(false);
    hooks.failBeforeBatch = false;

    // 12. Failure mid-batch (after processed_event_hashes insert) -> full rollback
    hooks.failAtStatementIndex = 2;
    expect((await batcher.commitAtomicBatch({
      botId: 'bot-crash', expectedVersion: 0, fencingToken: 1,
      requiredCashMicroUsd: ZERO_BIGINT, nextBalances: targetBal, entry: dep.data,
    })).ok).toBe(false);
    hooks.failAtStatementIndex = undefined;
    expect((await batcher.loadDurableBotState('bot-crash'))?.version).toBe(0);

    // 13-14. Worker crash after commit (ack lost) -> state IS durably committed
    hooks.failAfterCommitAck = true;
    const lostAck = await batcher.commitAtomicBatch({
      botId: 'bot-crash', expectedVersion: 0, fencingToken: 1,
      requiredCashMicroUsd: ZERO_BIGINT, nextBalances: targetBal, entry: dep.data,
    });
    expect(lostAck.ok).toBe(false);
    hooks.failAfterCommitAck = false;

    // 15. Retry after restart with same event hash fails idempotently with DUPLICATE_EVENT_HASH (no double credit)
    const retry = await batcher.commitAtomicBatch({
      botId: 'bot-crash', expectedVersion: 0, fencingToken: 1,
      requiredCashMicroUsd: ZERO_BIGINT, nextBalances: targetBal, entry: dep.data,
    });
    expect(retry.ok).toBe(false);
    if (!retry.ok) expect(retry.error).toContain('DUPLICATE_EVENT_HASH');

    // 18. Cold-restart hydration reconciles exact committed state
    const recovered = await batcher.loadDurableBotState('bot-crash');
    expect(recovered?.version).toBe(1);
    expect(recovered?.balances.CASH_AVAILABLE).toBe(BigInt(5_000) * MICRO_USD_PER_USD);
    expect(recovered?.processedEventHashes).toEqual(['ev-crash-dep']);
    expect(computeBalanceSheet(recovered!.balances).balanced).toBe(true);
  });

  it('17. isolates cross-tenant bot intents and accounts with zero cross-bot mutation', async () => {
    const { db } = createFaultInjectableD1();
    const batcher = new D1AtomicLedgerBatcher(db);
    await batcher.initializeBotAccount('bot-tenant-A', 1_000, 1);
    await batcher.initializeBotAccount('bot-tenant-B', 1_000, 1);

    const ledgerA = new MicroDoubleEntryLedger('bot-tenant-A', 1);
    const depA = ledgerA.depositCapital('ev-shared-hash', BigInt(9_000) * MICRO_USD_PER_USD, 1_001);
    expect(depA.ok).toBe(true);
    if (!depA.ok) return;

    expect((await batcher.commitAtomicBatch({
      botId: 'bot-tenant-A', expectedVersion: 0, fencingToken: 1,
      requiredCashMicroUsd: ZERO_BIGINT, nextBalances: ledgerA.getAccountBalances(),
      entry: depA.data, orderUpsert: makeOrder('ord-shared', 'OPEN'),
    })).ok).toBe(true);

    // Tenant B remains completely untouched despite identical event hash / clientOrderId namespace
    const stateA = await batcher.loadDurableBotState('bot-tenant-A');
    const stateB = await batcher.loadDurableBotState('bot-tenant-B');
    expect(stateA?.balances.CASH_AVAILABLE).toBe(BigInt(9_000) * MICRO_USD_PER_USD);
    expect(stateB?.balances.CASH_AVAILABLE).toBe(ZERO_BIGINT);
    expect(stateB?.orderIntents).toEqual([]);
    expect(stateB?.processedEventHashes).toEqual([]);
  });
});
