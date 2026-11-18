import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { OrderRequest, OrderResult } from '../exchange/types';
import { PaperOrderLifecycleEngine } from '../execution/lifecycle';
import {
  D1AtomicLedgerBatcher, MICRO_USD_PER_USD, MicroDoubleEntryLedger, ZERO_BIGINT,
  computeBalanceSheet, type D1DatabaseLike, type D1PreparedStatementLike,
} from '../ledger';
import { executeOrder, type OrderContext } from './bot-order-executor';
import { ensureDurableBotHydrated } from './bot-order-lifecycle-bridge';

const requireNode = createRequire(import.meta.url);

function createSqliteHarness() {
  const { DatabaseSync } = requireNode('node:sqlite') as {
    DatabaseSync: new (p: string) => {
      exec: (s: string) => void;
      prepare: (s: string) => {
        run: (...a: unknown[]) => { changes: number | bigint };
        all: (...a: unknown[]) => Array<Record<string, number | string>>;
        get: (...a: unknown[]) => Record<string, number | string> | undefined;
      };
    };
  };
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(path.resolve(process.cwd(), 'migrations/0017_paper_ledger_and_leases.sql'), 'utf8'));
  sqlite.exec(fs.readFileSync(path.resolve(process.cwd(), 'migrations/0019_paper_ledger_positions.sql'), 'utf8'));
  const fault = { failNextBatchesCount: 0, failLoadDurableState: false };

  const makeStmt = (sql: string, params: readonly unknown[] = []): D1PreparedStatementLike => ({
    bind: (...vals: unknown[]) => makeStmt(sql, vals),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
    all: async <T = unknown>() => ({ results: sqlite.prepare(sql).all(...params) as unknown as T[] }),
    first: async <T = unknown>() => {
      if (fault.failLoadDurableState && sql.includes('FROM paper_ledger_accounts')) {
        throw new Error('D1_READ_UNAVAILABLE');
      }
      return ((sqlite.prepare(sql).get(...params) as unknown as T | undefined) ?? null);
    },
  });

  const db: D1DatabaseLike = {
    prepare: (sql: string) => makeStmt(sql),
    batch: async <T = { meta?: { changes: number } }>(stmts: D1PreparedStatementLike[]) => {
      if (fault.failNextBatchesCount > 0) {
        fault.failNextBatchesCount -= 1;
        throw new Error('SQLITE_BUSY: post-dispatch lock');
      }
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const out: T[] = [];
        for (const s of stmts) out.push((await s.run()) as unknown as T);
        sqlite.exec('COMMIT');
        return out;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };
  return { sqlite, db, fault };
}

function makeCtx(
  botId: string, engine: PaperOrderLifecycleEngine, batcher: D1AtomicLedgerBatcher,
  placeOrder?: (r: OrderRequest) => Promise<OrderResult>,
): OrderContext {
  const cfg = { symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper' as const, strategy: 'grid' as const, capital: 10_000, maxDrawdownPct: 20, gridSpacingPct: 1, gridLevels: 5, capitalPerLevelPct: 10, takeProfitPct: 2, stopLossPct: 2, rebalanceOnFill: true };
  return {
    botId, config: { capital: 10_000, symbol: 'BTC/USDT' },
    state: { id: botId, config: cfg, status: 'running', createdAt: 1_000, startedAt: 1_000, error: null, totalPnl: 0, totalTrades: 0, winCount: 0, lossCount: 0, maxDrawdown: 0, currentDrawdown: 0, stoppedAt: null, lastTickAt: null, lastOrderAt: null, updatedAt: 1_000 },
    deps: {
      exchange: {
        placeOrder: placeOrder ?? (async (r) => ({ id: `f_${Date.now()}`, exchangeId: 'binance', symbol: r.symbol, side: r.side, type: r.type, price: r.price ?? 50_000, quantity: r.quantity, filled: r.quantity, fee: 0.5, status: 'filled', timestamp: 3_000 })),
      } as unknown as OrderContext['deps']['exchange'],
      killswitch: { isTradingEnabled: () => true, onOrderPlaced: () => {}, onOrderFilled: () => {}, updateDailyPnl: () => {}, updatePeakCapital: () => {} } as unknown as OrderContext['deps']['killswitch'],
      lifecycleEngine: engine, ledgerBatcher: batcher,
    },
    onTrade: () => {}, emitTelemetry: () => {}, emitState: () => {},
  };
}

describe('Bot Order Lifecycle Bridge — Post-Dispatch Fail-Closed & Fencing Recovery', () => {
  it('blocks new orders while post-dispatch fill commit is unreconciled, then atomically reconciles ORDER_FILL + FILLED intent + positions once D1 recovers', async () => {
    const { db, fault } = createSqliteHarness();
    const batcher = new D1AtomicLedgerBatcher(db);
    const ledger = new MicroDoubleEntryLedger('bot-post-rec');
    ledger.depositCapital('init_deposit', BigInt(10_000) * MICRO_USD_PER_USD, 1_000);
    const engine = new PaperOrderLifecycleEngine({ botId: 'bot-post-rec', ledger });
    let dispatchedCount = 0;
    const ctx = makeCtx('bot-post-rec', engine, batcher, async (r) => {
      dispatchedCount += 1;
      return {
        id: `fill_${dispatchedCount}`, exchangeId: 'binance', symbol: r.symbol, side: r.side, type: r.type,
        price: r.price ?? 50_000, quantity: r.quantity, filled: r.quantity, fee: 0.5, status: 'filled', timestamp: 2_000 + dispatchedCount,
      };
    });

    // Order 1 pre-dispatch succeeds (batch 1), post-dispatch fails (batch 2), and next order recovery fails (batch 3)
    await ensureDurableBotHydrated(ctx);
    fault.failNextBatchesCount = 0;
    let batchCount = 0;
    const origBatch = db.batch.bind(db);
    db.batch = async (stmts) => {
      batchCount += 1;
      if (batchCount === 2 || batchCount === 3) {
        fault.failLoadDurableState = batchCount === 2;
        throw new Error('SQLITE_BUSY: simulated post-dispatch outage');
      }
      fault.failLoadDurableState = false;
      return origBatch(stmts);
    };

    await expect(
      executeOrder(ctx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 0),
    ).rejects.toThrow(/Durable ledger commit failed: BATCH_ABORTED/);
    expect(dispatchedCount).toBe(1);

    // Next order attempt while D1 is still locked MUST fail closed BEFORE dispatching to exchange!
    await expect(
      executeOrder(ctx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 1),
    ).rejects.toThrow(/Durable ledger recovery failed \(fail-closed\)/);
    expect(dispatchedCount).toBe(1);

    // Once D1 recovers (batch 4+), ensureDurableBotHydrated/executeOrder reconciles Order 1's FILLED state + positions BEFORE Order 2!
    await executeOrder(ctx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 1);
    expect(dispatchedCount).toBe(2);

    const durable = await batcher.loadDurableBotState('bot-post-rec');
    expect(durable?.version).toBe(ledger.getVersion());
    expect(durable?.balances).toEqual(ledger.getAccountBalances());
    expect(durable?.orderIntents.map((o) => o.lifecycleState)).toEqual(['FILLED', 'FILLED']);
    expect(durable?.positions).toEqual(ledger.getAllPositions());
    expect(computeBalanceSheet(durable!.balances).discrepancyMicroUsd).toBe(ZERO_BIGINT);
  });

  it('latches permanent fail-closed halt when scheduler lease fencing token supersedes stale worker isolate', async () => {
    const { sqlite, db } = createSqliteHarness();
    const batcher = new D1AtomicLedgerBatcher(db);
    const ledger = new MicroDoubleEntryLedger('bot-fenced', 1);
    ledger.depositCapital('init_deposit', BigInt(10_000) * MICRO_USD_PER_USD, 1_000);
    const engine = new PaperOrderLifecycleEngine({ botId: 'bot-fenced', ledger });
    const ctx = makeCtx('bot-fenced', engine, batcher);

    await executeOrder(ctx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 0);

    // Simulate Worker B taking over durable scheduler lease with fencing_token = 5 and advancing account row
    sqlite.prepare(
      `INSERT INTO scheduler_bot_leases (bot_id, workspace_id, holder_id, fencing_token, acquired_at_ms, expires_at_ms)
       VALUES ('bot-fenced', 'ws-1', 'worker-B', 5, 5000, 9999999)`,
    ).run();
    sqlite.prepare(`UPDATE paper_ledger_accounts SET fencing_token = 5 WHERE bot_id = 'bot-fenced'`).run();

    // Stale Worker A (fencingToken = 1) fails pre-dispatch AND latches permanent fail-closed halt
    await expect(
      executeOrder(ctx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 1),
    ).rejects.toThrow(/OPTIMISTIC_CONCURRENCY_OR_CASH_GUARD_FAILED/);

    await expect(
      executeOrder(ctx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 1),
    ).rejects.toThrow(/Durable ledger halted \(fail-closed\)/);

    // Post-dispatch fencing takeover during venue execution also latches permanent fail-closed halt
    const ledger2 = new MicroDoubleEntryLedger('bot-post-fence', 1);
    ledger2.depositCapital('init_deposit', BigInt(10_000) * MICRO_USD_PER_USD, 1_000);
    const engine2 = new PaperOrderLifecycleEngine({ botId: 'bot-post-fence', ledger: ledger2 });
    const ctx2 = makeCtx('bot-post-fence', engine2, batcher, async (r) => {
      sqlite.prepare(
        `INSERT INTO scheduler_bot_leases (bot_id, workspace_id, holder_id, fencing_token, acquired_at_ms, expires_at_ms)
         VALUES ('bot-post-fence', 'ws-1', 'worker-B', 9, 6000, 9999999)`,
      ).run();
      return { id: 'f_mid', exchangeId: 'binance', symbol: r.symbol, side: r.side, type: r.type, price: 50_000, quantity: r.quantity, filled: r.quantity, fee: 0, status: 'filled', timestamp: 6_100 };
    });
    await expect(
      executeOrder(ctx2, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 0),
    ).rejects.toThrow(/OPTIMISTIC_CONCURRENCY_OR_CASH_GUARD_FAILED/);
    await expect(ensureDurableBotHydrated(ctx2)).rejects.toThrow(/Durable ledger halted \(fail-closed\)/);
  });
});
