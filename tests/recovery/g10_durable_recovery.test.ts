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
  computeBalanceSheet,
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

const MIGRATION_0017_PATH = path.resolve(
  __dirname,
  '../../migrations/0017_paper_ledger_and_leases.sql',
);
const MIGRATION_0017_SQL = fs.readFileSync(MIGRATION_0017_PATH, 'utf8');

interface FaultConfig {
  failMidBatchAtStatementIndex?: number;
  failBatchErrorMessage?: string;
  crashAfterCommitBeforeAck?: boolean;
}

interface BoundSqlOp {
  readonly sql: string;
  readonly params: readonly (number | string | bigint | null)[];
}

function createSqliteD1Harness(fault: FaultConfig = {}): {
  sqlite: SqliteDatabaseSyncLike;
  db: D1DatabaseLike & LeaseD1DatabaseLike;
  fault: FaultConfig;
} {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(MIGRATION_0017_SQL);

  const buildStmt = (sql: string, params: readonly unknown[] = []): D1PreparedStatementLike & { __op: BoundSqlOp } => {
    const typedParams = params as readonly (number | string | bigint | null)[];
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
        return {
          meta: {
            changes: Number(info.changes),
            last_row_id: Number(info.lastInsertRowid),
          },
        };
      },
    };
  };

  const db: D1DatabaseLike & LeaseD1DatabaseLike = {
    prepare(query: string) {
      return buildStmt(query);
    },
    async batch<T = { meta?: { changes: number } }>(statements: D1PreparedStatementLike[]): Promise<T[]> {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const out: unknown[] = [];
        for (let i = 0; i < statements.length; i++) {
          if (fault.failMidBatchAtStatementIndex !== undefined && i === fault.failMidBatchAtStatementIndex) {
            fault.failMidBatchAtStatementIndex = undefined;
            throw new Error(fault.failBatchErrorMessage ?? 'SQLITE_BUSY: database is locked mid-batch');
          }
          const op = (statements[i] as unknown as { __op: BoundSqlOp }).__op;
          const info = sqlite.prepare(op.sql).run(...op.params);
          out.push({ meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } });
        }
        sqlite.exec('COMMIT');
        if (fault.crashAfterCommitBeforeAck) {
          fault.crashAfterCommitBeforeAck = false;
          throw new Error('WORKER_ISOLATE_KILLED_POST_COMMIT_PRE_ACK');
        }
        return out as T[];
      } catch (err) {
        if (sqlite.isTransaction) {
          sqlite.exec('ROLLBACK');
        }
        throw err;
      }
    },
  };

  return { sqlite, db, fault };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Gate G10 — Micro-Unit Double-Entry db.batch() Ledger, CAS Leases & Chaos Recovery', () => {
  it('enforces balanced double-entry postings (UNBALANCED_JOURNAL_ENTRY) and zero IEEE-754 drift across micro-USD operations', () => {
    const ledger = new MicroDoubleEntryLedger('bot-math', 1);

    // Unbalanced raw journal entry fails closed with UNBALANCED_JOURNAL_ENTRY
    const unbalanced = ledger.postJournalEntry({
      eventHash: 'bad-unbalanced',
      eventType: 'CORRUPT_TEST',
      timestampMs: 1_000,
      legs: [
        { account: 'CASH_AVAILABLE', direction: 'DEBIT', amountMicroUsd: BigInt(1_000_000) },
        { account: 'INITIAL_CAPITAL', direction: 'CREDIT', amountMicroUsd: BigInt(999_999) },
      ],
    });
    expect(unbalanced.ok).toBe(false);
    if (!unbalanced.ok) expect(unbalanced.error).toContain('UNBALANCED_JOURNAL_ENTRY');

    // Empty legs & non-positive leg fail closed
    expect(
      ledger.postJournalEntry({ eventHash: 'empty', eventType: 'X', timestampMs: 1_000, legs: [] }).ok,
    ).toBe(false);
    expect(
      ledger.postJournalEntry({
        eventHash: 'zero-leg',
        eventType: 'X',
        timestampMs: 1_000,
        legs: [{ account: 'CASH_AVAILABLE', direction: 'DEBIT', amountMicroUsd: ZERO_BIGINT }],
      }).ok,
    ).toBe(false);

    // Deposit $100,000.30 (100_000_300_000 micro-USD) via 0.1 + 0.2 micro-cent stress
    expect(ledger.depositCapital('dep-1', BigInt(100_000_100_000), 1_000).ok).toBe(true);
    expect(ledger.depositCapital('dep-2', BigInt(200_000), 1_001).ok).toBe(true);
    expect(ledger.getAccountBalances().INITIAL_CAPITAL).toBe(BigInt(100_000_300_000));

    // Open SHORT, flip to LONG, apply positive & negative funding, close LONG
    const shortRes = ledger.applyFill({
      eventHash: 'short-open',
      symbol: 'BTC/USDT',
      side: 'sell',
      fillQtyBase: BASE_UNITS_PER_ASSET, // 1 BTC
      fillPriceMicroUsd: BigInt(50_000) * MICRO_USD_PER_USD,
      feeMicroUsd: BigInt(25_123_456), // $25.123456
      releasedOrderMarginMicroUsd: ZERO_BIGINT,
      marginRateBps: BigInt(2_000), // 20% = $10,000 margin
      timestampMs: 1_100,
    });
    expect(shortRes.ok).toBe(true);
    expect(ledger.getPosition('BTC/USDT').signedQtyBase).toBe(-BASE_UNITS_PER_ASSET);

    // Flip SHORT (-1 BTC) -> LONG (+1 BTC) via 2 BTC BUY @ $49,000 (+$1,000 realized profit on short!)
    const flipRes = ledger.applyFill({
      eventHash: 'flip-to-long',
      symbol: 'BTC/USDT',
      side: 'buy',
      fillQtyBase: BASE_UNITS_PER_ASSET * BigInt(2),
      fillPriceMicroUsd: BigInt(49_000) * MICRO_USD_PER_USD,
      feeMicroUsd: BigInt(49_000_000), // $49
      releasedOrderMarginMicroUsd: ZERO_BIGINT,
      marginRateBps: BigInt(2_000), // $9,800 margin on new 1 BTC long
      timestampMs: 1_200,
    });
    expect(flipRes.ok).toBe(true);
    expect(ledger.getPosition('BTC/USDT').signedQtyBase).toBe(BASE_UNITS_PER_ASSET);
    expect(ledger.getAccountBalances().REALIZED_PNL).toBe(BigInt(1_000) * MICRO_USD_PER_USD);

    // Positive & negative funding cashflows
    expect(ledger.applyFundingCashflow('fund-in', BigInt(12_345_678), 1_300).ok).toBe(true);
    expect(ledger.applyFundingCashflow('fund-out', -BigInt(2_345_678), 1_400).ok).toBe(true);
    expect(ledger.getAccountBalances().FUNDING_NET).toBe(BigInt(10_000_000)); // +$10 exact

    // Snapshot export & restore round-trip
    const snap = ledger.exportSnapshot();
    const restored = new MicroDoubleEntryLedger('bot-math-restored');
    expect(restored.restoreSnapshot(snap).ok).toBe(true);
    expect(restored.getBalanceSheet().discrepancyMicroUsd).toBe(ZERO_BIGINT);
    expect(restored.getBalanceSheet().balanced).toBe(true);
    expect(restored.getAccountBalances()).toEqual(ledger.getAccountBalances());
  });

  it('commits D1 db.batch() atomically and rolls back completely on UNIQUE conflict, stale version, negative cash, or SQLITE_BUSY', async () => {
    const { db, fault } = createSqliteD1Harness();
    const batcher = new D1AtomicLedgerBatcher(db);
    const botId = 'bot-d1-atomic';
    await batcher.initializeBotAccount(botId, 1_000, 1);

    const ledger = new MicroDoubleEntryLedger(botId, 1);
    const dep = ledger.depositCapital('ev-dep-1', BigInt(50_000) * MICRO_USD_PER_USD, 1_010);
    expect(dep.ok).toBe(true);
    if (!dep.ok) return;

    const commit1 = await batcher.commitAtomicBatch({
      botId,
      expectedVersion: 0,
      fencingToken: 1,
      requiredCashMicroUsd: ZERO_BIGINT,
      nextBalances: ledger.getAccountBalances(),
      entry: dep.data,
    });
    expect(commit1.ok).toBe(true);

    // 1. Duplicate event_hash -> UNIQUE conflict rolls back entire batch
    const dupCommit = await batcher.commitAtomicBatch({
      botId,
      expectedVersion: 1,
      fencingToken: 1,
      requiredCashMicroUsd: ZERO_BIGINT,
      nextBalances: ledger.getAccountBalances(),
      entry: dep.data,
    });
    expect(dupCommit.ok).toBe(false);
    if (!dupCommit.ok) expect(dupCommit.error).toContain('DUPLICATE_EVENT_HASH');

    // 2. Stale optimistic version (expectedVersion = 0 when DB is at version = 1) -> rolls back event_hash too!
    const resv = ledger.reserveMargin('ev-resv-stale-test', BigInt(10_000) * MICRO_USD_PER_USD, 1_020);
    expect(resv.ok).toBe(true);
    if (!resv.ok) return;

    const staleVersionCommit = await batcher.commitAtomicBatch({
      botId,
      expectedVersion: 0, // STALE!
      fencingToken: 1,
      requiredCashMicroUsd: BigInt(10_000) * MICRO_USD_PER_USD,
      nextBalances: ledger.getAccountBalances(),
      entry: resv.data,
    });
    expect(staleVersionCommit.ok).toBe(false);
    if (!staleVersionCommit.ok) {
      expect(staleVersionCommit.error).toContain('OPTIMISTIC_CONCURRENCY_OR_CASH_GUARD_FAILED');
    }

    // Prove ev-resv-stale-test was ROLLED BACK from processed_event_hashes!
    const afterStale = await batcher.loadDurableBotState(botId);
    expect(afterStale?.version).toBe(1);
    expect(afterStale?.processedEventHashes).toEqual(['ev-dep-1']);

    // 3. Mid-batch SQLITE_BUSY throw on statement index 2 -> rolls back statements 0 & 1!
    fault.failMidBatchAtStatementIndex = 2;
    const busyCommit = await batcher.commitAtomicBatch({
      botId,
      expectedVersion: 1,
      fencingToken: 1,
      requiredCashMicroUsd: BigInt(10_000) * MICRO_USD_PER_USD,
      nextBalances: ledger.getAccountBalances(),
      entry: resv.data,
    });
    expect(busyCommit.ok).toBe(false);
    if (!busyCommit.ok) expect(busyCommit.error).toContain('BATCH_ABORTED');

    const afterBusy = await batcher.loadDurableBotState(botId);
    expect(afterBusy?.version).toBe(1);
    expect(afterBusy?.processedEventHashes).toEqual(['ev-dep-1']);

    // 4. Clean retry with expectedVersion = 1 now succeeds cleanly!
    const cleanRetry = await batcher.commitAtomicBatch({
      botId,
      expectedVersion: 1,
      fencingToken: 1,
      requiredCashMicroUsd: BigInt(10_000) * MICRO_USD_PER_USD,
      nextBalances: ledger.getAccountBalances(),
      entry: resv.data,
    });
    expect(cleanRetry.ok).toBe(true);
    const afterClean = await batcher.loadDurableBotState(botId);
    expect(afterClean?.version).toBe(2);
    expect(computeBalanceSheet(afterClean!.balances).discrepancyMicroUsd).toBe(ZERO_BIGINT);
  });

  it('survives Kills 1–5 deterministically: PENDING_INTENT crash, mid-batch OOM, post-commit crash, lease fencing takeover, and ExecutionBudgetGuard', async () => {
    const { db, fault } = createSqliteD1Harness();
    const coordinator = new CloudSchedulerCoordinator(db);
    const batcher = new D1AtomicLedgerBatcher(db);
    const botId = 'bot-kills-1-to-5';
    const wsId = 'ws-chaos';

    // Worker A acquires durable CAS lease -> fencingToken = 1
    const leaseA = await coordinator.acquireDurableTickLease({
      botId,
      workspaceId: wsId,
      isolateId: 'worker-A',
      nowMs: 10_000,
      leaseDurationMs: 30_000,
    });
    expect(leaseA.ok).toBe(true);
    if (!leaseA.ok) return;
    expect(leaseA.data.fencingToken).toBe(1);

    // Kill 4a: Competing Worker B tries to steal active lease at t=15_000 -> BLOCKED!
    const stealAttempt = await coordinator.acquireDurableTickLease({
      botId,
      workspaceId: wsId,
      isolateId: 'worker-B',
      nowMs: 15_000,
      leaseDurationMs: 30_000,
    });
    expect(stealAttempt.ok).toBe(false);
    if (!stealAttempt.ok) expect(stealAttempt.error).toContain('DUPLICATE_TICK_GUARD');

    await batcher.initializeBotAccount(botId, 10_000, leaseA.data.fencingToken);
    const ledgerA = new MicroDoubleEntryLedger(botId, leaseA.data.fencingToken);
    const depEntry = ledgerA.depositCapital('dep-init', BigInt(100_000) * MICRO_USD_PER_USD, 10_050);
    expect(depEntry.ok).toBe(true);
    if (!depEntry.ok) return;
    await batcher.commitAtomicBatch({
      botId,
      expectedVersion: 0,
      fencingToken: leaseA.data.fencingToken,
      requiredCashMicroUsd: ZERO_BIGINT,
      nextBalances: ledgerA.getAccountBalances(),
      entry: depEntry.data,
    });

    // Kill 1: Worker A writes PENDING_INTENT, then dies BEFORE paper fill!
    const intent1: AtomicOrderStateUpsert = {
      clientOrderId: 'ord-kill-1',
      symbol: 'BTC/USDT',
      side: 'buy',
      orderType: 'market',
      quantityBase: BASE_UNITS_PER_ASSET,
      filledQtyBase: ZERO_BIGINT,
      limitPriceMicroUsd: BigInt(50_000) * MICRO_USD_PER_USD,
      reservedMarginMicroUsd: ZERO_BIGINT,
      reduceOnly: false,
      lifecycleState: 'PENDING_INTENT',
      createdAtMs: 12_000,
      updatedAtMs: 12_000,
    };
    expect((await batcher.writePendingOrderIntent(botId, leaseA.data.fencingToken, intent1)).ok).toBe(true);
    // [CRASH 1: Worker A isolate dies before fill]

    // Lease expires at t=40_000 -> Worker B takes over with fencingToken = 2!
    const leaseB = await coordinator.acquireDurableTickLease({
      botId,
      workspaceId: wsId,
      isolateId: 'worker-B',
      nowMs: 40_000,
      leaseDurationMs: 30_000,
    });
    expect(leaseB.ok).toBe(true);
    if (!leaseB.ok) return;
    expect(leaseB.data.fencingToken).toBe(2);
    expect(coordinator.validateFencingToken(wsId, botId, leaseA.data.fencingToken).ok).toBe(false);

    // Worker B hydrates durable state, discovers PENDING_INTENT 'ord-kill-1'
    const hydratedB = await batcher.loadDurableBotState(botId);
    expect(hydratedB?.orderIntents).toHaveLength(1);
    expect(hydratedB?.orderIntents[0].lifecycleState).toBe('PENDING_INTENT');

    const ledgerB = new MicroDoubleEntryLedger(botId, leaseB.data.fencingToken);
    ledgerB.restoreSnapshot({
      botId,
      version: hydratedB!.version,
      fencingToken: leaseB.data.fencingToken,
      balances: hydratedB!.balances,
      positions: [],
      processedEventHashes: hydratedB!.processedEventHashes,
    });

    const fillRes = ledgerB.applyFill({
      eventHash: 'fill-ord-kill-1',
      symbol: 'BTC/USDT',
      side: 'buy',
      fillQtyBase: BASE_UNITS_PER_ASSET,
      fillPriceMicroUsd: BigInt(50_000) * MICRO_USD_PER_USD,
      feeMicroUsd: BigInt(50) * MICRO_USD_PER_USD,
      releasedOrderMarginMicroUsd: ZERO_BIGINT,
      marginRateBps: BigInt(2_000),
      timestampMs: 40_100,
    });
    expect(fillRes.ok).toBe(true);
    if (!fillRes.ok) return;

    // Kill 2: Mid-batch Worker OOM throw during Worker B's commit!
    fault.failMidBatchAtStatementIndex = 1;
    fault.failBatchErrorMessage = 'WORKER_OOM_KILLED_MID_BATCH';
    const midBatchCrash = await batcher.commitAtomicBatch({
      botId,
      expectedVersion: hydratedB!.version,
      fencingToken: leaseB.data.fencingToken,
      requiredCashMicroUsd: BigInt(10_050) * MICRO_USD_PER_USD,
      nextBalances: ledgerB.getAccountBalances(),
      entry: fillRes.data.entry,
      orderUpsert: {
        ...intent1,
        filledQtyBase: BASE_UNITS_PER_ASSET,
        lifecycleState: 'FILLED',
        updatedAtMs: 40_100,
      },
    });
    expect(midBatchCrash.ok).toBe(false);
    // Verify DB rolled back completely: still PENDING_INTENT, version still 1!
    const afterOom = await batcher.loadDurableBotState(botId);
    expect(afterOom?.version).toBe(1);
    expect(afterOom?.orderIntents[0].lifecycleState).toBe('PENDING_INTENT');

    // Kill 3: Retry commits to D1, then Worker dies BEFORE returning in-memory ack!
    fault.crashAfterCommitBeforeAck = true;
    const preAckCrash = await batcher.commitAtomicBatch({
      botId,
      expectedVersion: 1,
      fencingToken: leaseB.data.fencingToken,
      requiredCashMicroUsd: BigInt(10_050) * MICRO_USD_PER_USD,
      nextBalances: ledgerB.getAccountBalances(),
      entry: fillRes.data.entry,
      orderUpsert: {
        ...intent1,
        filledQtyBase: BASE_UNITS_PER_ASSET,
        lifecycleState: 'FILLED',
        updatedAtMs: 40_200,
      },
    });
    expect(preAckCrash.ok).toBe(false); // Caller saw crash!

    // Caller or restarted Worker replays the same commit -> idempotently rejected by processed_event_hashes!
    const replayAfterPreAck = await batcher.commitAtomicBatch({
      botId,
      expectedVersion: 1,
      fencingToken: leaseB.data.fencingToken,
      requiredCashMicroUsd: BigInt(10_050) * MICRO_USD_PER_USD,
      nextBalances: ledgerB.getAccountBalances(),
      entry: fillRes.data.entry,
      orderUpsert: {
        ...intent1,
        filledQtyBase: BASE_UNITS_PER_ASSET,
        lifecycleState: 'FILLED',
        updatedAtMs: 40_250,
      },
    });
    expect(replayAfterPreAck.ok).toBe(false);
    if (!replayAfterPreAck.ok) expect(replayAfterPreAck.error).toContain('DUPLICATE_EVENT_HASH');

    // Kill 4b: Zombie Worker A wakes up with stale fencingToken = 1 and tries to write order intent or ledger batch -> REJECTED!
    const zombieIntent = await batcher.writePendingOrderIntent(botId, leaseA.data.fencingToken, {
      ...intent1,
      clientOrderId: 'ord-kill-1',
      lifecycleState: 'CANCELLED',
      updatedAtMs: 41_000,
    });
    expect(zombieIntent.ok).toBe(false);
    if (!zombieIntent.ok) expect(zombieIntent.error).toBe('STALE_FENCING_TOKEN_ON_INTENT');

    const zombieFund = ledgerA.applyFundingCashflow('zombie-fund', BigInt(500_000), 41_000);
    expect(zombieFund.ok).toBe(true);
    if (zombieFund.ok) {
      const zombieBatch = await batcher.commitAtomicBatch({
        botId,
        expectedVersion: 2,
        fencingToken: leaseA.data.fencingToken, // fencingToken 1 < DB fencing_token 2!
        requiredCashMicroUsd: ZERO_BIGINT,
        nextBalances: ledgerB.getAccountBalances(),
        entry: zombieFund.data,
      });
      expect(zombieBatch.ok).toBe(false);
      if (!zombieBatch.ok) {
        expect(zombieBatch.error).toContain('OPTIMISTIC_CONCURRENCY_OR_CASH_GUARD_FAILED');
      }
    }

    // Early lease release by active holder Worker B
    const relB = await coordinator.releaseDurableTickLease(botId, 'worker-B', leaseB.data.fencingToken, 45_000);
    expect(relB.ok).toBe(true);
    if (relB.ok) expect(relB.data).toBe(true);

    // Kill 5: Runaway recursive tick loop & subrequest storm tripped by ExecutionBudgetGuard
    const guard = coordinator.createExecutionBudgetGuard({
      maxSubrequests: 5,
      maxAdapterCalls: 3,
      maxRecursionDepth: 2,
    });
    const runRecursive = async (depth: number): Promise<string> => {
      const nested = await guard.executeTick(async () => {
        if (depth < 10) {
          const inner = await runRecursive(depth + 1);
          return inner;
        }
        return 'done';
      });
      if (!nested.ok) throw new Error(nested.error);
      return nested.data;
    };
    await expect(runRecursive(0)).rejects.toThrow('EXECUTION_BUDGET_EXCEEDED: maxRecursionDepth (2) exceeded');
    expect(guard.isTripped()).toBe(true);

    const adapterGuard = coordinator.createExecutionBudgetGuard({
      maxSubrequests: 4,
      maxAdapterCalls: 2,
      maxRecursionDepth: 3,
    });
    expect(adapterGuard.recordAdapterCall(1).ok).toBe(true);
    expect(adapterGuard.recordAdapterCall(1).ok).toBe(true);
    const thirdAdapter = adapterGuard.recordAdapterCall(1);
    expect(thirdAdapter.ok).toBe(false);
    if (!thirdAdapter.ok) expect(thirdAdapter.error).toContain('maxAdapterCalls');

    // Final durable state verification: exact 1 FILLED order, exact $50 fee once, exact 0n discrepancy!
    const finalState = await batcher.loadDurableBotState(botId);
    expect(finalState?.version).toBe(2);
    expect(finalState?.orderIntents).toHaveLength(1);
    expect(finalState?.orderIntents[0].lifecycleState).toBe('FILLED');
    expect(finalState?.balances.FEES_EXPENSE).toBe(BigInt(50) * MICRO_USD_PER_USD);
    expect(computeBalanceSheet(finalState!.balances).discrepancyMicroUsd).toBe(ZERO_BIGINT);
  });

  it('passes 50 randomized chaos restart seeds (seed = 1..50) with 0 lost orders, 0 duplicated positions, 0 double-charged fees, and exact 0n discrepancy', async () => {
    for (let seed = 1; seed <= 50; seed++) {
      await verifySingleChaosSeed(seed);
    }
  });

  it('enforces all ledger, D1 batcher, coordinator, and budget guard boundary error paths', async () => {
    const ledger = new MicroDoubleEntryLedger('bot-edge', 2);
    expect(ledger.getBotId()).toBe('bot-edge');
    expect(ledger.getVersion()).toBe(0);
    expect(ledger.getFencingToken()).toBe(2);
    expect(ledger.updateFencingToken(1).ok).toBe(false);
    expect(ledger.updateFencingToken(3).ok).toBe(true);

    // Invalid inputs & asset deficit guards
    expect(ledger.postJournalEntry({ eventHash: '  ', eventType: 'X', timestampMs: 1, legs: [] }).ok).toBe(false);
    expect(ledger.depositCapital('d0', ZERO_BIGINT, 1).ok).toBe(false);
    expect(ledger.reserveMargin('r0', ZERO_BIGINT, 1).ok).toBe(false);
    expect(ledger.releaseMargin('rel0', ZERO_BIGINT, 1).ok).toBe(false);
    expect(ledger.applyFundingCashflow('f0', ZERO_BIGINT, 1).ok).toBe(false);
    expect(
      ledger.applyFill({
        eventHash: 'bad1', symbol: 'BTC/USDT', side: 'buy', fillQtyBase: ZERO_BIGINT,
        fillPriceMicroUsd: BigInt(100), feeMicroUsd: ZERO_BIGINT, releasedOrderMarginMicroUsd: ZERO_BIGINT, timestampMs: 1,
      }).ok,
    ).toBe(false);
    expect(
      ledger.applyFill({
        eventHash: 'bad2', symbol: 'BTC/USDT', side: 'buy', fillQtyBase: BigInt(100),
        fillPriceMicroUsd: BigInt(100), feeMicroUsd: -BigInt(1), releasedOrderMarginMicroUsd: ZERO_BIGINT, timestampMs: 1,
      }).ok,
    ).toBe(false);

    // Deficit guards on CASH_AVAILABLE, MARGIN_RESERVED, POSITION_MARGIN
    expect(ledger.reserveMargin('no-cash', BigInt(100), 1).ok).toBe(false);
    expect(ledger.releaseMargin('no-resv', BigInt(100), 1).ok).toBe(false);
    expect(
      ledger.postJournalEntry({
        eventHash: 'no-pos-margin',
        eventType: 'TEST',
        timestampMs: 1,
        legs: [
          { account: 'CASH_AVAILABLE', direction: 'DEBIT', amountMicroUsd: BigInt(100) },
          { account: 'POSITION_MARGIN', direction: 'CREDIT', amountMicroUsd: BigInt(100) },
        ],
      }).ok,
    ).toBe(false);

    expect(ledger.depositCapital('dep-ok', BigInt(100_000) * MICRO_USD_PER_USD, 10).ok).toBe(true);
    expect(ledger.hasProcessedEvent('dep-ok')).toBe(true);
    expect(ledger.depositCapital('dep-ok', BigInt(100), 11).ok).toBe(false);

    // Realized LOSS path & journal entries check
    expect(
      ledger.applyFill({
        eventHash: 'open-long-loss', symbol: 'ETH/USDT', side: 'buy', fillQtyBase: BASE_UNITS_PER_ASSET,
        fillPriceMicroUsd: BigInt(3_000) * MICRO_USD_PER_USD, feeMicroUsd: ZERO_BIGINT,
        releasedOrderMarginMicroUsd: ZERO_BIGINT, timestampMs: 20,
      }).ok,
    ).toBe(true);
    expect(
      ledger.applyFill({
        eventHash: 'close-long-loss', symbol: 'ETH/USDT', side: 'sell', fillQtyBase: BASE_UNITS_PER_ASSET,
        fillPriceMicroUsd: BigInt(2_800) * MICRO_USD_PER_USD, feeMicroUsd: ZERO_BIGINT,
        releasedOrderMarginMicroUsd: ZERO_BIGINT, timestampMs: 30,
      }).ok,
    ).toBe(true);
    expect(ledger.getAccountBalances().REALIZED_PNL).toBe(-BigInt(200) * MICRO_USD_PER_USD);
    expect(ledger.getJournalEntries().length).toBeGreaterThanOrEqual(3);

    // Corrupt snapshot rejection
    const corruptSnap = ledger.exportSnapshot();
    expect(
      ledger.restoreSnapshot({
        ...corruptSnap,
        balances: { ...corruptSnap.balances, CASH_AVAILABLE: corruptSnap.balances.CASH_AVAILABLE + BigInt(1) },
      }).ok,
    ).toBe(false);

    // D1AtomicLedgerBatcher overflow, invalid batch inputs, missing bot, and mock 0-row/string-error paths
    const { db } = createSqliteD1Harness();
    const batcher = new D1AtomicLedgerBatcher(db);
    expect(await batcher.loadDurableBotState('nonexistent-bot')).toBeNull();

    const validEntry = ledger.getJournalEntries()[0];
    expect(
      (await batcher.commitAtomicBatch({
        botId: 'b', expectedVersion: 0, fencingToken: 1, requiredCashMicroUsd: ZERO_BIGINT,
        nextBalances: ledger.getAccountBalances(),
        entry: { ...validEntry, legs: [] },
      })).ok,
    ).toBe(false);
    expect(
      (await batcher.commitAtomicBatch({
        botId: 'b', expectedVersion: 0, fencingToken: 1, requiredCashMicroUsd: ZERO_BIGINT,
        nextBalances: { ...ledger.getAccountBalances(), CASH_AVAILABLE: ledger.getAccountBalances().CASH_AVAILABLE + BigInt(1) },
        entry: validEntry,
      })).ok,
    ).toBe(false);
    expect(
      (await batcher.commitAtomicBatch({
        botId: 'b', expectedVersion: 0, fencingToken: 1, requiredCashMicroUsd: ZERO_BIGINT,
        nextBalances: {
          ...ledger.getAccountBalances(),
          CASH_AVAILABLE: -BigInt(1),
          MARGIN_RESERVED: ledger.getAccountBalances().MARGIN_RESERVED + ledger.getAccountBalances().CASH_AVAILABLE + BigInt(1),
        },
        entry: validEntry,
      })).ok,
    ).toBe(false);

    const overflowVal = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(10);
    expect(
      (await batcher.writePendingOrderIntent('b', 1, {
        clientOrderId: 'ov', symbol: 'BTC/USDT', side: 'buy', orderType: 'limit',
        quantityBase: overflowVal, filledQtyBase: ZERO_BIGINT, limitPriceMicroUsd: BigInt(100),
        reservedMarginMicroUsd: ZERO_BIGINT, reduceOnly: true, lifecycleState: 'OPEN', createdAtMs: 1, updatedAtMs: 1,
      })).ok,
    ).toBe(false);
    expect(
      (await batcher.commitAtomicBatch({
        botId: 'b', expectedVersion: 0, fencingToken: 1, requiredCashMicroUsd: overflowVal,
        nextBalances: ledger.getAccountBalances(), entry: validEntry,
      })).ok,
    ).toBe(false);

    // Mock D1 testing non-Error string throw and 0-row batch response
    const mockZeroDb: D1DatabaseLike = {
      prepare() {
        const s: D1PreparedStatementLike = {
          bind: () => s,
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => { throw 'raw-string-db-error'; },
        };
        return s;
      },
      batch: async <T = { meta?: { changes: number } }>() => [{ meta: { changes: 1 } }, { meta: { changes: 0 } }] as unknown as T[],
    };
    const mockBatcher = new D1AtomicLedgerBatcher(mockZeroDb);
    expect(
      (await mockBatcher.writePendingOrderIntent('b', 1, {
        clientOrderId: 'c1', symbol: 'BTC/USDT', side: 'buy', orderType: 'limit',
        quantityBase: BigInt(1), filledQtyBase: ZERO_BIGINT, limitPriceMicroUsd: BigInt(100),
        reservedMarginMicroUsd: ZERO_BIGINT, reduceOnly: false, lifecycleState: 'OPEN', createdAtMs: 1, updatedAtMs: 1,
      })).ok,
    ).toBe(false);
    expect(
      (await mockBatcher.commitAtomicBatch({
        botId: 'b', expectedVersion: 0, fencingToken: 1, requiredCashMicroUsd: ZERO_BIGINT,
        nextBalances: ledger.getAccountBalances(), entry: validEntry,
      })).ok,
    ).toBe(false);

    // Coordinator unconfigured store, setDatabase, pruneExpiredLeases, dbOverride, and budget guard paths
    const unconfiguredCoord = new CloudSchedulerCoordinator();
    expect(unconfiguredCoord.validateFencingToken('unseen-ws', 'unseen-bot', 1).ok).toBe(true);
    expect((await unconfiguredCoord.acquireDurableTickLease({ botId: 'b', workspaceId: 'w', isolateId: 'i', nowMs: 1_000 })).ok).toBe(false);
    expect((await unconfiguredCoord.releaseDurableTickLease('b', 'i', 1, 1_000)).ok).toBe(false);
    unconfiguredCoord.setDatabase(db);
    const overLease = await unconfiguredCoord.acquireDurableTickLease(
      { botId: 'b-ovr', workspaceId: 'w', isolateId: 'i1', nowMs: 60_000 },
      db,
    );
    expect(overLease.ok).toBe(true);
    expect(unconfiguredCoord.activeLeaseCount(60_500, 'w')).toBe(1);
    expect(unconfiguredCoord.activeLeaseCount(60_500, 'other-ws')).toBe(0);
    expect(unconfiguredCoord.validateFencingToken('w', 'b-ovr', 1).ok).toBe(true);
    expect((await unconfiguredCoord.releaseDurableTickLease('b-ovr', 'i1', 1, 61_000, db)).ok).toBe(true);
    expect(unconfiguredCoord.pruneExpiredLeases(200_000)).toBeGreaterThanOrEqual(1);
    unconfiguredCoord.clearLeases();
    expect(unconfiguredCoord.activeLeaseCount(200_000)).toBe(0);
    unconfiguredCoord.setDatabase(undefined);

    // Null row lease store fallback & tripped adapter call
    const nullRowLeaseDb: LeaseD1DatabaseLike = {
      prepare() {
        const s = { bind: () => s, first: async () => null, run: async () => ({ meta: { changes: 0 } }) };
        return s;
      },
    };
    expect((await unconfiguredCoord.acquireDurableTickLease({ botId: 'b', workspaceId: 'w', isolateId: 'i', nowMs: 1 }, nullRowLeaseDb)).ok).toBe(false);

    const defGuard = unconfiguredCoord.createExecutionBudgetGuard();
    expect(defGuard.getSnapshot().maxSubrequests).toBe(40);
    expect(defGuard.recordAdapterCall().ok).toBe(true);
    expect(defGuard.recordAdapterCall(0).ok).toBe(false);
    const subGuard = unconfiguredCoord.createExecutionBudgetGuard({ maxSubrequests: 1 });
    expect(subGuard.recordSubrequest(2).ok).toBe(false);
    const throwGuard = unconfiguredCoord.createExecutionBudgetGuard();
    const strThrow = await throwGuard.executeTick(() => { throw 'non-error-throw'; });
    expect(strThrow.ok).toBe(false);
    const okTick = await throwGuard.executeTick(() => 42);
    expect(okTick).toEqual({ ok: true, data: 42 });

    // Overflow leg & overflow orderUpsert inside commitAtomicBatch + valid reduceOnly intent
    expect(
      (await batcher.writePendingOrderIntent('b', 1, {
        clientOrderId: 'ro-valid', symbol: 'BTC/USDT', side: 'sell', orderType: 'limit',
        quantityBase: BigInt(10), filledQtyBase: ZERO_BIGINT, limitPriceMicroUsd: BigInt(100),
        reservedMarginMicroUsd: ZERO_BIGINT, reduceOnly: true, lifecycleState: 'OPEN', createdAtMs: 1, updatedAtMs: 1,
      })).ok,
    ).toBe(true);
    expect(
      (await batcher.commitAtomicBatch({
        botId: 'b', expectedVersion: 0, fencingToken: 1, requiredCashMicroUsd: ZERO_BIGINT,
        nextBalances: ledger.getAccountBalances(),
        entry: {
          ...validEntry,
          legs: [
            { account: 'CASH_AVAILABLE', direction: 'DEBIT', amountMicroUsd: overflowVal },
            { account: 'INITIAL_CAPITAL', direction: 'CREDIT', amountMicroUsd: overflowVal },
          ],
        },
      })).ok,
    ).toBe(false);
    expect(
      (await batcher.commitAtomicBatch({
        botId: 'b', expectedVersion: 0, fencingToken: 1, requiredCashMicroUsd: ZERO_BIGINT,
        nextBalances: ledger.getAccountBalances(),
        entry: validEntry,
        orderUpsert: {
          clientOrderId: 'ov-up', symbol: 'BTC/USDT', side: 'buy', orderType: 'limit',
          quantityBase: overflowVal, filledQtyBase: ZERO_BIGINT, limitPriceMicroUsd: BigInt(100),
          reservedMarginMicroUsd: ZERO_BIGINT, reduceOnly: false, lifecycleState: 'OPEN', createdAtMs: 1, updatedAtMs: 1,
        },
      })).ok,
    ).toBe(false);
  });
});

interface PlannedChaosStep {
  readonly stepIndex: number;
  readonly kind: 'ORDER' | 'FUNDING';
  readonly clientOrderId: string;
  readonly eventHash: string;
  readonly side: 'buy' | 'sell';
  readonly qtyBase: bigint;
  readonly priceMicroUsd: bigint;
  readonly feeMicroUsd: bigint;
  readonly fundingSignedMicroUsd: bigint;
}

function buildChaosSteps(seed: number, rng: () => number): PlannedChaosStep[] {
  const steps: PlannedChaosStep[] = [];
  for (let s = 0; s < 8; s++) {
    const fundingMag = BigInt(Math.floor(rng() * 15_000_000) + 100_000);
    steps.push({
      stepIndex: s,
      kind: s % 4 === 3 ? 'FUNDING' : 'ORDER',
      clientOrderId: `seed_${seed}_ord_${s}`,
      eventHash: `seed_${seed}_ev_${s}`,
      side: rng() < 0.5 ? 'buy' : 'sell',
      qtyBase: BigInt(Math.floor(rng() * 50_000_000) + 10_000_000),
      priceMicroUsd: BigInt(Math.floor(rng() * 10_000) + 45_000) * MICRO_USD_PER_USD,
      feeMicroUsd: BigInt(Math.floor(rng() * 8_000_000) + 500_000),
      fundingSignedMicroUsd: rng() < 0.5 ? fundingMag : -fundingMag,
    });
  }
  return steps;
}

function applyStepToTracker(ledger: MicroDoubleEntryLedger, st: PlannedChaosStep, ts: number): void {
  if (st.kind === 'ORDER') {
    const r = ledger.applyFill({
      eventHash: st.eventHash, symbol: 'BTC/USDT', side: st.side,
      fillQtyBase: st.qtyBase, fillPriceMicroUsd: st.priceMicroUsd, feeMicroUsd: st.feeMicroUsd,
      releasedOrderMarginMicroUsd: ZERO_BIGINT, marginRateBps: BigInt(2_000), timestampMs: ts,
    });
    expect(r.ok).toBe(true);
  } else {
    expect(ledger.applyFundingCashflow(st.eventHash, st.fundingSignedMicroUsd, ts).ok).toBe(true);
  }
}

async function assertZombieFencedOut(
  batcher: D1AtomicLedgerBatcher,
  botId: string,
  staleToken: number,
  seed: number,
  stepIdx: number,
  nowMs: number,
): Promise<void> {
  const zombieRes = await batcher.writePendingOrderIntent(botId, staleToken, {
    clientOrderId: `zombie_${seed}_${stepIdx}`,
    symbol: 'BTC/USDT',
    side: 'buy',
    orderType: 'market',
    quantityBase: BigInt(10_000_000),
    filledQtyBase: ZERO_BIGINT,
    limitPriceMicroUsd: BigInt(50_000) * MICRO_USD_PER_USD,
    reservedMarginMicroUsd: ZERO_BIGINT,
    reduceOnly: false,
    lifecycleState: 'PENDING_INTENT',
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  });
  expect(zombieRes.ok).toBe(false);
}

async function attemptOrderChaosStep(params: {
  batcher: D1AtomicLedgerBatcher;
  fault: FaultConfig;
  workerLedger: MicroDoubleEntryLedger;
  appliedPositions: MicroDoubleEntryLedger;
  botId: string;
  fencingToken: number;
  durableVersion: number;
  st: PlannedChaosStep;
  chaosRoll: number;
  nowMs: number;
}): Promise<{ completed: boolean; killedFencingToken?: number }> {
  const { batcher, fault, workerLedger, appliedPositions, botId, fencingToken, durableVersion, st, chaosRoll, nowMs } = params;
  const pendingIntent: AtomicOrderStateUpsert = {
    clientOrderId: st.clientOrderId, symbol: 'BTC/USDT', side: st.side, orderType: 'market',
    quantityBase: st.qtyBase, filledQtyBase: ZERO_BIGINT, limitPriceMicroUsd: st.priceMicroUsd,
    reservedMarginMicroUsd: ZERO_BIGINT, reduceOnly: false, lifecycleState: 'PENDING_INTENT',
    createdAtMs: nowMs, updatedAtMs: nowMs,
  };
  expect((await batcher.writePendingOrderIntent(botId, fencingToken, pendingIntent)).ok).toBe(true);
  if (chaosRoll < 0.25) return { completed: false, killedFencingToken: fencingToken };

  const fillOut = workerLedger.applyFill({
    eventHash: st.eventHash, symbol: 'BTC/USDT', side: st.side,
    fillQtyBase: st.qtyBase, fillPriceMicroUsd: st.priceMicroUsd, feeMicroUsd: st.feeMicroUsd,
    releasedOrderMarginMicroUsd: ZERO_BIGINT, marginRateBps: BigInt(2_000), timestampMs: nowMs,
  });
  if (!fillOut.ok) throw new Error(fillOut.error);

  let killedFencingToken: number | undefined;
  if (chaosRoll < 0.50) {
    fault.failMidBatchAtStatementIndex = 2;
    killedFencingToken = fencingToken;
  } else if (chaosRoll < 0.75) {
    fault.crashAfterCommitBeforeAck = true;
    killedFencingToken = fencingToken;
  }

  const commitRes = await batcher.commitAtomicBatch({
    botId, expectedVersion: durableVersion, fencingToken, requiredCashMicroUsd: ZERO_BIGINT,
    nextBalances: workerLedger.getAccountBalances(), entry: fillOut.data.entry,
    orderUpsert: { ...pendingIntent, filledQtyBase: st.qtyBase, lifecycleState: 'FILLED', updatedAtMs: nowMs },
  });
  if (commitRes.ok) {
    applyStepToTracker(appliedPositions, st, nowMs);
    return { completed: true };
  }
  const check = await batcher.loadDurableBotState(botId);
  if (check?.processedEventHashes.includes(st.eventHash)) applyStepToTracker(appliedPositions, st, nowMs);
  return { completed: false, killedFencingToken };
}

async function attemptFundingChaosStep(params: {
  batcher: D1AtomicLedgerBatcher;
  fault: FaultConfig;
  workerLedger: MicroDoubleEntryLedger;
  appliedPositions: MicroDoubleEntryLedger;
  botId: string;
  fencingToken: number;
  durableVersion: number;
  st: PlannedChaosStep;
  chaosRoll: number;
  nowMs: number;
}): Promise<{ completed: boolean }> {
  const { batcher, fault, workerLedger, appliedPositions, botId, fencingToken, durableVersion, st, chaosRoll, nowMs } = params;
  const fundOut = workerLedger.applyFundingCashflow(st.eventHash, st.fundingSignedMicroUsd, nowMs);
  if (!fundOut.ok) throw new Error(fundOut.error);
  if (chaosRoll < 0.35) fault.failMidBatchAtStatementIndex = 1;
  else if (chaosRoll < 0.70) fault.crashAfterCommitBeforeAck = true;

  const commitRes = await batcher.commitAtomicBatch({
    botId, expectedVersion: durableVersion, fencingToken, requiredCashMicroUsd: ZERO_BIGINT,
    nextBalances: workerLedger.getAccountBalances(), entry: fundOut.data,
  });
  if (commitRes.ok) {
    applyStepToTracker(appliedPositions, st, nowMs);
    return { completed: true };
  }
  const check = await batcher.loadDurableBotState(botId);
  if (check?.processedEventHashes.includes(st.eventHash)) applyStepToTracker(appliedPositions, st, nowMs);
  return { completed: false };
}

async function executeStepUntilDurable(params: {
  seed: number;
  botId: string;
  wsId: string;
  st: PlannedChaosStep;
  rng: () => number;
  coordinator: CloudSchedulerCoordinator;
  batcher: D1AtomicLedgerBatcher;
  fault: FaultConfig;
  appliedPositions: MicroDoubleEntryLedger;
  startNowMs: number;
}): Promise<number> {
  let nowMs = params.startNowMs;
  let attempts = 0;
  let staleToken: number | undefined;

  while (attempts < 8) {
    attempts += 1;
    nowMs += 1_500;
    const lease = await params.coordinator.acquireDurableTickLease({
      botId: params.botId, workspaceId: params.wsId,
      isolateId: `iso-${params.seed}-${params.st.stepIndex}-${attempts}`, nowMs, leaseDurationMs: 1_000,
    });
    if (!lease.ok) throw new Error(lease.error);

    if (staleToken !== undefined) {
      await assertZombieFencedOut(params.batcher, params.botId, staleToken, params.seed, params.st.stepIndex, nowMs);
      staleToken = undefined;
    }

    const durable = await params.batcher.loadDurableBotState(params.botId);
    if (!durable) throw new Error('Missing durable bot state');
    if (durable.processedEventHashes.includes(params.st.eventHash)) return nowMs;

    const workerLedger = new MicroDoubleEntryLedger(params.botId, lease.data.fencingToken);
    workerLedger.restoreSnapshot({
      botId: params.botId, version: durable.version, fencingToken: lease.data.fencingToken,
      balances: durable.balances, positions: [params.appliedPositions.getPosition('BTC/USDT')],
      processedEventHashes: durable.processedEventHashes,
    });

    const chaosRoll = attempts === 1 ? params.rng() : 0.99;
    if (params.st.kind === 'ORDER') {
      const res = await attemptOrderChaosStep({
        batcher: params.batcher, fault: params.fault, workerLedger, appliedPositions: params.appliedPositions,
        botId: params.botId, fencingToken: lease.data.fencingToken, durableVersion: durable.version,
        st: params.st, chaosRoll, nowMs,
      });
      if (res.completed) return nowMs;
      staleToken = res.killedFencingToken;
    } else {
      const res = await attemptFundingChaosStep({
        batcher: params.batcher, fault: params.fault, workerLedger, appliedPositions: params.appliedPositions,
        botId: params.botId, fencingToken: lease.data.fencingToken, durableVersion: durable.version,
        st: params.st, chaosRoll, nowMs,
      });
      if (res.completed) return nowMs;
    }
  }
  throw new Error(`Chaos step failed to converge after ${attempts} attempts`);
}

async function verifySingleChaosSeed(seed: number): Promise<void> {
  const rng = mulberry32(seed);
  const botId = `chaos-bot-seed-${seed}`;
  const wsId = 'ws-chaos-50';
  const initialCapital = BigInt(500_000) * MICRO_USD_PER_USD;
  const steps = buildChaosSteps(seed, rng);
  const expectedOrdersCount = steps.filter((s) => s.kind === 'ORDER').length;

  const oracleLedger = new MicroDoubleEntryLedger(`${botId}-oracle`, 1);
  oracleLedger.depositCapital(`seed_${seed}_init`, initialCapital, 1_000);
  for (const st of steps) applyStepToTracker(oracleLedger, st, 2_000 + st.stepIndex * 100);

  const { db, fault } = createSqliteD1Harness();
  const coordinator = new CloudSchedulerCoordinator(db);
  const batcher = new D1AtomicLedgerBatcher(db);
  let nowMs = 10_000;

  const initLease = await coordinator.acquireDurableTickLease({
    botId, workspaceId: wsId, isolateId: 'iso-init', nowMs, leaseDurationMs: 1_000,
  });
  if (!initLease.ok) throw new Error(initLease.error);
  await batcher.initializeBotAccount(botId, nowMs, initLease.data.fencingToken);

  const bootLedger = new MicroDoubleEntryLedger(botId, initLease.data.fencingToken);
  const initDep = bootLedger.depositCapital(`seed_${seed}_init`, initialCapital, nowMs);
  if (!initDep.ok) throw new Error(initDep.error);
  await batcher.commitAtomicBatch({
    botId, expectedVersion: 0, fencingToken: initLease.data.fencingToken,
    requiredCashMicroUsd: ZERO_BIGINT, nextBalances: bootLedger.getAccountBalances(), entry: initDep.data,
  });

  const appliedPositions = new MicroDoubleEntryLedger(`${botId}-reconstruct`, 1);
  appliedPositions.depositCapital(`seed_${seed}_init`, initialCapital, nowMs);

  for (const st of steps) {
    nowMs = await executeStepUntilDurable({
      seed, botId, wsId, st, rng, coordinator, batcher, fault, appliedPositions, startNowMs: nowMs,
    });
  }

  const finalDurable = await batcher.loadDurableBotState(botId);
  expect(finalDurable).not.toBeNull();
  if (!finalDurable) return;

  const sheet = computeBalanceSheet(finalDurable.balances);
  expect(sheet.discrepancyMicroUsd).toBe(ZERO_BIGINT);
  expect(sheet.balanced).toBe(true);
  expect(finalDurable.orderIntents).toHaveLength(expectedOrdersCount);
  expect(finalDurable.orderIntents.filter((o) => o.lifecycleState === 'FILLED')).toHaveLength(expectedOrdersCount);
  expect(appliedPositions.getPosition('BTC/USDT')).toEqual(oracleLedger.getPosition('BTC/USDT'));
  expect(finalDurable.balances.FEES_EXPENSE).toBe(oracleLedger.getAccountBalances().FEES_EXPENSE);
  expect(finalDurable.balances).toEqual(oracleLedger.getAccountBalances());
}

