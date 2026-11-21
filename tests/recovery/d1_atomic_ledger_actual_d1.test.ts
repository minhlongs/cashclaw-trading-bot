import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
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
import { hasPositionsTableInDb } from '@/tree/ledger/d1-positions-sql';
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

function createFullLedgerSqliteD1(include0019 = true): {
  sqlite: SqliteDatabaseSyncLike;
  db: D1DatabaseLike & LeaseD1DatabaseLike;
} {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(MIGRATION_0017_SQL);
  if (include0019) sqlite.exec(MIGRATION_0019_SQL);

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
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const out: unknown[] = [];
        for (const stmt of statements) {
          const op = (stmt as unknown as { __op: BoundSqlOp }).__op;
          const info = sqlite.prepare(op.sql).run(...op.params);
          out.push({ meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } });
        }
        sqlite.exec('COMMIT');
        return out as T[];
      } catch (err) {
        if (sqlite.isTransaction) sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };

  return { sqlite, db };
}

function makeOrder(id: string, state: AtomicOrderStateUpsert['lifecycleState'], filled = ZERO_BIGINT): AtomicOrderStateUpsert {
  return {
    clientOrderId: id,
    symbol: 'BTCUSDT',
    side: 'buy',
    orderType: 'limit',
    quantityBase: BASE_UNITS_PER_ASSET,
    filledQtyBase: filled,
    limitPriceMicroUsd: BigInt(50_000) * MICRO_USD_PER_USD,
    reservedMarginMicroUsd: BigInt(5_000) * MICRO_USD_PER_USD,
    reduceOnly: false,
    lifecycleState: state,
    createdAtMs: 1_000,
    updatedAtMs: 1_100,
  };
}

describe('Atomic D1 Ledger Fencing, Rollback & Independent Oracle Verification', () => {
  it('rolls back earlier order upserts atomically when a later order upsert in the same batch has a stale fencing token', async () => {
    const { db } = createFullLedgerSqliteD1(true);
    const batcher = new D1AtomicLedgerBatcher(db);
    await batcher.initializeBotAccount('bot-atomic-1', 1_000, 4);

    // Seed ord-b with higher fencing_token = 5
    const seedRes = await batcher.writePendingOrderIntent('bot-atomic-1', 5, makeOrder('ord-b', 'OPEN'));
    expect(seedRes.ok).toBe(true);

    // Stale worker (token 4) submits a group with [ord-a (new), ord-b (stale)].
    // The entire batch MUST abort atomically — ord-a MUST NOT commit to D1.
    const staleRes = await batcher.commitAtomicGroup({
      botId: 'bot-atomic-1',
      expectedVersion: 0,
      fencingToken: 4,
      steps: [],
      orderUpserts: [makeOrder('ord-a-must-rollback', 'OPEN'), makeOrder('ord-b', 'PARTIALLY_FILLED', BASE_UNITS_PER_ASSET / BigInt(2))],
    });

    expect(staleRes.ok).toBe(false);
    const loaded = await batcher.loadDurableBotState('bot-atomic-1');
    expect(loaded?.orderIntents.map((o) => o.clientOrderId)).toEqual(['ord-b']);
    expect(loaded?.orderIntents[0]?.lifecycleState).toBe('OPEN');
  });

  it('rolls back ledger journal and balance mutations when an order upsert in the same group fails fencing', async () => {
    const { db } = createFullLedgerSqliteD1(true);
    const batcher = new D1AtomicLedgerBatcher(db);
    await batcher.initializeBotAccount('bot-atomic-2', 1_000, 4);
    expect((await batcher.writePendingOrderIntent('bot-atomic-2', 5, makeOrder('ord-fenced', 'OPEN'))).ok).toBe(true);

    const ledger = new MicroDoubleEntryLedger('bot-atomic-2', 4);
    const dep = ledger.depositCapital('ev-dep-fenced', BigInt(10_000) * MICRO_USD_PER_USD, 1_001);
    expect(dep.ok).toBe(true);
    if (!dep.ok) return;

    const res = await batcher.commitAtomicGroup({
      botId: 'bot-atomic-2',
      expectedVersion: 0,
      fencingToken: 4,
      steps: [{
        entry: dep.data,
        nextBalances: ledger.getAccountBalances(),
        requiredCashMicroUsd: ZERO_BIGINT,
      }],
      orderUpserts: [makeOrder('ord-fenced', 'CANCELLED')],
    });

    expect(res.ok).toBe(false);
    const loaded = await batcher.loadDurableBotState('bot-atomic-2');
    expect(loaded?.version).toBe(0);
    expect(loaded?.balances.CASH_AVAILABLE).toBe(ZERO_BIGINT);
    expect(loaded?.processedEventHashes).toEqual([]);
  });

  it('refuses stale fencing token position-only writes without deleting newer positions', async () => {
    const { db } = createFullLedgerSqliteD1(true);
    const batcher = new D1AtomicLedgerBatcher(db);
    await batcher.initializeBotAccount('bot-atomic-3', 1_000, 5);

    const validPos = await batcher.commitAtomicGroup({
      botId: 'bot-atomic-3',
      expectedVersion: 0,
      fencingToken: 5,
      steps: [],
      positions: [{
        symbol: 'BTCUSDT',
        signedQtyBase: BASE_UNITS_PER_ASSET,
        openNotionalMicroUsd: BigInt(50_000) * MICRO_USD_PER_USD,
        openMarginMicroUsd: BigInt(5_000) * MICRO_USD_PER_USD,
      }],
    });
    expect(validPos.ok).toBe(true);

    // Stale worker with token 4 attempts to overwrite positions (even without an active lease row)
    const stalePos = await batcher.commitAtomicGroup({
      botId: 'bot-atomic-3',
      expectedVersion: 0,
      fencingToken: 4,
      steps: [],
      positions: [{
        symbol: 'BTCUSDT',
        signedQtyBase: BASE_UNITS_PER_ASSET / BigInt(2),
        openNotionalMicroUsd: BigInt(25_000) * MICRO_USD_PER_USD,
        openMarginMicroUsd: BigInt(2_500) * MICRO_USD_PER_USD,
      }],
    });

    expect(stalePos.ok).toBe(false);
    const loaded = await batcher.loadDurableBotState('bot-atomic-3');
    expect(loaded?.positions).toEqual([{
      symbol: 'BTCUSDT',
      signedQtyBase: BASE_UNITS_PER_ASSET,
      openNotionalMicroUsd: BigInt(50_000) * MICRO_USD_PER_USD,
      openMarginMicroUsd: BigInt(5_000) * MICRO_USD_PER_USD,
    }]);
  });

  it('does not permanently cache false for paper_ledger_positions and fails closed on transient probe errors', async () => {
    const { sqlite, db } = createFullLedgerSqliteD1(false);
    expect(await hasPositionsTableInDb(db)).toBe(false);

    // Apply migration 0019 to the same DB handle -> cache was not poisoned with false
    sqlite.exec(MIGRATION_0019_SQL);
    expect(await hasPositionsTableInDb(db)).toBe(true);

    // Inject transient SQLITE_BUSY on sqlite_master probe against a fresh DB wrapper
    const { db: freshDb } = createFullLedgerSqliteD1(true);
    let failFirstProbe = true;
    const flakyDb: D1DatabaseLike = {
      prepare(sql: string) {
        const inner = freshDb.prepare(sql);
        if (sql.includes('sqlite_master') && failFirstProbe) {
          return {
            bind(...params: unknown[]) {
              inner.bind(...params);
              return this;
            },
            async first<T>() {
              failFirstProbe = false;
              throw new Error('SQLITE_BUSY: database is locked');
            },
            async all<T>() {
              return inner.all<T>();
            },
            async run() {
              return inner.run();
            },
          };
        }
        return inner;
      },
      batch(stmts) {
        return freshDb.batch(stmts);
      },
    };

    const batcher = new D1AtomicLedgerBatcher(flakyDb);
    await batcher.initializeBotAccount('bot-probe-fail', 1_000, 1);
    const ledger = new MicroDoubleEntryLedger('bot-probe-fail', 1);
    const dep = ledger.depositCapital('ev-probe-1', BigInt(1_000) * MICRO_USD_PER_USD, 1_001);
    expect(dep.ok).toBe(true);
    if (!dep.ok) return;
    const nextBal = applyLegsToBalances(createZeroAccountBalances(), dep.data.legs);

    // First attempt MUST fail closed with POSITIONS_TABLE_PROBE_FAILED and NOT commit balances
    const firstTry = await batcher.commitAtomicBatch({
      botId: 'bot-probe-fail',
      expectedVersion: 0,
      fencingToken: 1,
      requiredCashMicroUsd: ZERO_BIGINT,
      nextBalances: nextBal,
      entry: dep.data,
      positions: [],
    });
    expect(firstTry.ok).toBe(false);
    if (!firstTry.ok) {
      expect(firstTry.error).toContain('POSITIONS_TABLE_PROBE_FAILED');
    }
    const afterFail = await batcher.loadDurableBotState('bot-probe-fail');
    expect(afterFail?.version).toBe(0);

    // Retry after transient error clears MUST succeed cleanly
    const secondTry = await batcher.commitAtomicBatch({
      botId: 'bot-probe-fail',
      expectedVersion: 0,
      fencingToken: 1,
      requiredCashMicroUsd: ZERO_BIGINT,
      nextBalances: nextBal,
      entry: dep.data,
      positions: [],
    });
    expect(secondTry.ok).toBe(true);
    const afterOk = await batcher.loadDurableBotState('bot-probe-fail');
    expect(afterOk?.version).toBe(1);
  });

  it('reconciles a full multi-event lifecycle against an independent Python Decimal oracle with zero micro-unit discrepancy', async () => {
    const { sqlite, db } = createFullLedgerSqliteD1(true);
    const batcher = new D1AtomicLedgerBatcher(db);
    const coordinator = new CloudSchedulerCoordinator(db);
    const lease = await coordinator.acquireDurableTickLease({
      botId: 'bot-oracle',
      workspaceId: 'ws-alpha',
      isolateId: 'worker-1',
      nowMs: 1_000,
      leaseDurationMs: 30_000,
    });
    expect(lease.ok).toBe(true);
    if (!lease.ok) return;
    const token = lease.data.fencingToken;

    await batcher.initializeBotAccount('bot-oracle', 1_000, token);
    const ledger = new MicroDoubleEntryLedger('bot-oracle', token);

    const oracleEvents: Array<Record<string, string | number>> = [];
    let version = 0;
    let prevBalances = createZeroAccountBalances();

    const commitEntry = async (
      entryRes: ReturnType<MicroDoubleEntryLedger['depositCapital']>,
      oracleEvent: Record<string, string | number>,
      orderUpsert?: AtomicOrderStateUpsert,
    ): Promise<void> => {
      expect(entryRes.ok).toBe(true);
      if (!entryRes.ok) return;
      const nextBalances = applyLegsToBalances(prevBalances, entryRes.data.legs);
      const outflow = prevBalances.CASH_AVAILABLE - nextBalances.CASH_AVAILABLE;
      const commit = await batcher.commitAtomicBatch({
        botId: 'bot-oracle',
        expectedVersion: version,
        fencingToken: token,
        requiredCashMicroUsd: outflow > ZERO_BIGINT ? outflow : ZERO_BIGINT,
        nextBalances,
        entry: entryRes.data,
        ...(orderUpsert ? { orderUpsert } : {}),
        positions: ledger.getAllPositions(),
      });
      expect(commit.ok).toBe(true);
      expect(computeBalanceSheet(nextBalances).balanced).toBe(true);
      version += 1;
      prevBalances = nextBalances;
      oracleEvents.push(oracleEvent);
    };

    const depositAmt = BigInt(20_000) * MICRO_USD_PER_USD;
    await commitEntry(
      ledger.depositCapital('ev-1-dep', depositAmt, 1_010),
      { event_id: 'ev-1-dep', type: 'DEPOSIT', amount_micro_usd: depositAmt.toString() },
    );

    // Reserve 5,000 USD for 1 BTC limit buy @ 50,000 USD (10% margin = 1000 bps)
    const reserveAmt = BigInt(5_000) * MICRO_USD_PER_USD;
    await commitEntry(
      ledger.reserveMargin('ev-2-res', reserveAmt, 1_020),
      { event_id: 'ev-2-res', type: 'RESERVE_MARGIN', amount_micro_usd: reserveAmt.toString() },
      makeOrder('ord-1', 'OPEN'),
    );

    // Partial fill: 0.5 BTC @ 50,000 USD -> 25,000 notional -> 2,500 USD margin (1000 bps), fee 12.50 USD
    const partialMargin = BigInt(2_500) * MICRO_USD_PER_USD;
    const partialFee = BigInt(12_500_000);
    const fillOpen = ledger.applyFill({
      eventHash: 'ev-3-pfill',
      symbol: 'BTCUSDT',
      side: 'buy',
      fillQtyBase: BASE_UNITS_PER_ASSET / BigInt(2),
      fillPriceMicroUsd: BigInt(50_000) * MICRO_USD_PER_USD,
      feeMicroUsd: partialFee,
      releasedOrderMarginMicroUsd: partialMargin,
      marginRateBps: BigInt(1_000),
      timestampMs: 1_030,
    });
    expect(fillOpen.ok).toBe(true);
    if (!fillOpen.ok) return;
    await commitEntry(
      { ok: true, data: fillOpen.data.entry },
      {
        event_id: 'ev-3-pfill',
        type: 'FILL_OPEN',
        margin_used_micro_usd: partialMargin.toString(),
        fee_micro_usd: partialFee.toString(),
      },
      makeOrder('ord-1', 'PARTIALLY_FILLED', BASE_UNITS_PER_ASSET / BigInt(2)),
    );

    // Cancel remainder -> release 2,500 USD reserved margin
    const releaseAmt = BigInt(2_500) * MICRO_USD_PER_USD;
    await commitEntry(
      ledger.releaseMargin('ev-4-cancel-rel', releaseAmt, 1_040),
      { event_id: 'ev-4-cancel-rel', type: 'RELEASE_MARGIN', amount_micro_usd: releaseAmt.toString() },
      makeOrder('ord-1', 'CANCELLED', BASE_UNITS_PER_ASSET / BigInt(2)),
    );

    // Funding cashflow (+18.75 USD)
    const fundingAmt = BigInt(18_750_000);
    await commitEntry(
      ledger.applyFundingCashflow('ev-5-fund', fundingAmt, 1_050),
      { event_id: 'ev-5-fund', type: 'FUNDING', amount_micro_usd: fundingAmt.toString() },
    );

    // Reduce-only close: sell 0.5 BTC @ 50,840.50 USD -> +420.25 USD realized PnL, fee 11.00 USD
    const closeFee = BigInt(11_000_000);
    const fillClose = ledger.applyFill({
      eventHash: 'ev-6-close',
      symbol: 'BTCUSDT',
      side: 'sell',
      fillQtyBase: BASE_UNITS_PER_ASSET / BigInt(2),
      fillPriceMicroUsd: BigInt(50_840_500_000),
      feeMicroUsd: closeFee,
      releasedOrderMarginMicroUsd: ZERO_BIGINT,
      marginRateBps: BigInt(1_000),
      timestampMs: 1_060,
    });
    expect(fillClose.ok).toBe(true);
    if (!fillClose.ok) return;
    await commitEntry(
      { ok: true, data: fillClose.data.entry },
      {
        event_id: 'ev-6-close',
        type: 'FILL_CLOSE',
        margin_released_micro_usd: partialMargin.toString(),
        realized_pnl_micro_usd: fillClose.data.realizedPnlDeltaMicroUsd.toString(),
        fee_micro_usd: closeFee.toString(),
      },
    );

    const loaded = await batcher.loadDurableBotState('bot-oracle');
    expect(loaded).not.toBeNull();
    expect(loaded?.positions).toEqual([]);

    const journalLegs = sqlite
      .prepare('SELECT entry_id, account_code, direction, amount_micro_usd FROM paper_journal_entries WHERE bot_id = ? ORDER BY account_version ASC, leg_index ASC')
      .all('bot-oracle') as Array<Record<string, string | number>>;

    const oracleInput = JSON.stringify({
      events: oracleEvents,
      observed_balances: {
        CASH_AVAILABLE: loaded!.balances.CASH_AVAILABLE.toString(),
        MARGIN_RESERVED: loaded!.balances.MARGIN_RESERVED.toString(),
        POSITION_MARGIN: loaded!.balances.POSITION_MARGIN.toString(),
        REALIZED_PNL: loaded!.balances.REALIZED_PNL.toString(),
        FEES_EXPENSE: loaded!.balances.FEES_EXPENSE.toString(),
        FUNDING_NET: loaded!.balances.FUNDING_NET.toString(),
        INITIAL_CAPITAL: loaded!.balances.INITIAL_CAPITAL.toString(),
      },
      observed_journal_legs: journalLegs,
    });

    const oracleOut = execFileSync(
      'python3',
      ['-I', path.resolve(__dirname, '../../scripts/verify_ledger_oracle.py')],
      { input: oracleInput, encoding: 'utf8' },
    );
    const report = JSON.parse(oracleOut) as {
      ok: boolean;
      events_reconciled: number;
      final_residual_micro_usd: string;
      mismatches: unknown[];
    };
    expect(report.ok).toBe(true);
    expect(report.events_reconciled).toBe(6);
    expect(report.final_residual_micro_usd).toBe('0');
    expect(report.mismatches).toEqual([]);
  });

  it('proves cross-statement changes()=1 and atomic rollback directly on actual local Wrangler D1', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cashclaw-actual-d1-ledger-'));
    try {
      const wranglerBin = path.resolve(__dirname, '../../node_modules/.bin/wrangler');
      execFileSync(wranglerBin, ['d1', 'migrations', 'apply', 'cashclaw-db', '--local', '--persist-to', tmpDir], {
        stdio: 'pipe',
      });

      const okSql = path.join(tmpDir, 'ok.sql');
      fs.writeFileSync(
        okSql,
        `INSERT INTO paper_ledger_accounts (
          bot_id, cash_micro_usd, margin_reserved_micro_usd, position_margin_micro_usd,
          realized_pnl_micro_usd, fees_expense_micro_usd, funding_net_micro_usd,
          initial_capital_micro_usd, version, fencing_token, updated_at_ms
        ) VALUES ('bot-d1-real', 1000000, 0, 0, 0, 0, 0, 1000000, 0, 1, 1000);
        INSERT INTO processed_event_hashes (bot_id, event_hash, event_type, account_version, processed_at_ms)
        VALUES ('bot-d1-real', 'ev-d1-1', 'DEPOSIT', 1, 1001);
        UPDATE paper_ledger_accounts
           SET cash_micro_usd = 2000000, initial_capital_micro_usd = 2000000, version = version + 1, fencing_token = 1, updated_at_ms = 1001
         WHERE bot_id = 'bot-d1-real' AND version = 0 AND fencing_token <= 1;
        INSERT INTO paper_journal_entries (
          entry_id, bot_id, event_hash, leg_index, account_code,
          direction, amount_micro_usd, account_version, created_at_ms
        ) VALUES ('e-1', 'bot-d1-real', 'ev-d1-1', 0, 'CASH_AVAILABLE', 'DEBIT', 1000000, CASE WHEN changes() = 1 THEN 1 ELSE NULL END, 1001);`,
      );
      execFileSync(wranglerBin, ['d1', 'execute', 'cashclaw-db', '--local', '--persist-to', tmpDir, '--json', '--file', okSql], {
        stdio: 'pipe',
      });

      // Now run a 0-row UPDATE (wrong version = 99) -> CASE WHEN changes() = 1 MUST fail NOT NULL and roll back processed_event_hashes
      const failSql = path.join(tmpDir, 'fail.sql');
      fs.writeFileSync(
        failSql,
        `INSERT INTO processed_event_hashes (bot_id, event_hash, event_type, account_version, processed_at_ms)
        VALUES ('bot-d1-real', 'ev-d1-stale', 'DEPOSIT', 2, 1002);
        UPDATE paper_ledger_accounts
           SET cash_micro_usd = 3000000, version = version + 1, fencing_token = 1, updated_at_ms = 1002
         WHERE bot_id = 'bot-d1-real' AND version = 99 AND fencing_token <= 1;
        INSERT INTO paper_journal_entries (
          entry_id, bot_id, event_hash, leg_index, account_code,
          direction, amount_micro_usd, account_version, created_at_ms
        ) VALUES ('e-2', 'bot-d1-real', 'ev-d1-stale', 0, 'CASH_AVAILABLE', 'DEBIT', 1000000, CASE WHEN changes() = 1 THEN 2 ELSE NULL END, 1002);`,
      );

      let failed = false;
      try {
        execFileSync(wranglerBin, ['d1', 'execute', 'cashclaw-db', '--local', '--persist-to', tmpDir, '--json', '--file', failSql], {
          stdio: 'pipe',
        });
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);

      const verifyRaw = execFileSync(
        wranglerBin,
        [
          'd1', 'execute', 'cashclaw-db', '--local', '--persist-to', tmpDir, '--json',
          '--command', "SELECT event_hash FROM processed_event_hashes WHERE bot_id='bot-d1-real' ORDER BY account_version ASC;",
        ],
        { encoding: 'utf8' },
      );
      const parsed = JSON.parse(verifyRaw) as Array<{ results: Array<{ event_hash: string }> }>;
      expect(parsed[0]?.results.map((r) => r.event_hash)).toEqual(['ev-d1-1']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 60_000);
});
