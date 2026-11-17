import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { OrderRequest, OrderResult } from '../exchange/types';
import { PaperOrderLifecycleEngine } from '../execution/lifecycle';
import {
  BASE_UNITS_PER_ASSET, D1AtomicLedgerBatcher, MICRO_USD_PER_USD, MicroDoubleEntryLedger, ZERO_BIGINT,
  computeBalanceSheet, type D1DatabaseLike, type D1PreparedStatementLike,
} from '../ledger';
import { executeOrder, type OrderContext } from './bot-order-executor';
import {
  cancelLifecycleOrder, releaseLifecycleOnDispatchThrow, submitLifecyclePreDispatch,
} from './bot-order-lifecycle-bridge';

const requireNode = createRequire(import.meta.url);
interface SqliteFault {
  failAtBatchIndex: number | null;
  crashAfterCommitBeforeAck: boolean;
  failAllRuns: boolean;
}

function createRealSqliteD1() {
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
  const fault: SqliteFault = { failAtBatchIndex: null, crashAfterCommitBeforeAck: false, failAllRuns: false };

  const makeStmt = (sql: string, params: readonly unknown[] = []): D1PreparedStatementLike => ({
    bind: (...vals: unknown[]) => makeStmt(sql, vals),
    run: async () => {
      if (fault.failAllRuns && sql.includes('paper_order_intents')) throw new Error('SQLITE_BUSY: intent locked');
      return { meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } };
    },
    all: async <T = unknown>() => ({ results: sqlite.prepare(sql).all(...params) as unknown as T[] }),
    first: async <T = unknown>() => ((sqlite.prepare(sql).get(...params) as unknown as T | undefined) ?? null),
  });

  const db: D1DatabaseLike = {
    prepare: (sql: string) => makeStmt(sql),
    batch: async <T = { meta?: { changes: number } }>(stmts: D1PreparedStatementLike[]) => {
      sqlite.exec('BEGIN IMMEDIATE');
      const out: T[] = [];
      try {
        for (let i = 0; i < stmts.length; i++) {
          if (fault.failAtBatchIndex === i) {
            fault.failAtBatchIndex = null;
            throw new Error(`SQLITE_BUSY: aborted at statement ${i}`);
          }
          out.push((await stmts[i]!.run()) as unknown as T);
        }
        sqlite.exec('COMMIT');
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
      if (fault.crashAfterCommitBeforeAck) {
        fault.crashAfterCommitBeforeAck = false;
        throw new Error('NETWORK_DROP_POST_COMMIT_PRE_ACK');
      }
      return out;
    },
  };
  return { sqlite, db, fault };
}

function buildCtx(
  botId: string, lifecycleEngine: PaperOrderLifecycleEngine, batcher: D1AtomicLedgerBatcher,
  placeOrder?: (req: OrderRequest) => Promise<OrderResult>,
): OrderContext {
  const cfg = { symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper' as const, strategy: 'grid' as const, capital: 10_000, maxDrawdownPct: 20, gridSpacingPct: 1, gridLevels: 5, capitalPerLevelPct: 10, takeProfitPct: 2, stopLossPct: 2, rebalanceOnFill: true };
  return {
    botId, config: { capital: 10_000, symbol: 'BTC/USDT' },
    state: { id: botId, config: cfg, status: 'running', createdAt: 1_000, startedAt: 1_000, error: null, totalPnl: 0, totalTrades: 0, winCount: 0, lossCount: 0, maxDrawdown: 0, currentDrawdown: 0, stoppedAt: null, lastTickAt: null, lastOrderAt: null, updatedAt: 1_000 },
    deps: {
      exchange: {
        placeOrder: placeOrder ?? (async (r) => ({ id: `v_${Date.now()}`, exchangeId: 'binance', symbol: r.symbol, side: r.side, type: r.type, price: r.price ?? 50_000, quantity: r.quantity, filled: r.quantity, fee: 0.5, status: 'filled', timestamp: 2_000 })),
      } as unknown as OrderContext['deps']['exchange'],
      killswitch: { isTradingEnabled: () => true, onOrderPlaced: () => {}, onOrderFilled: () => {}, updateDailyPnl: () => {}, updatePeakCapital: () => {} } as unknown as OrderContext['deps']['killswitch'],
      lifecycleEngine, ledgerBatcher: batcher,
    },
    onTrade: () => {}, emitTelemetry: () => {}, emitState: () => {},
  };
}

describe('Bot Order Lifecycle Bridge — Atomic Group Commit & Rollback Parity', () => {
  it('rolls back entire [DEPOSIT_CAPITAL + RESERVE_MARGIN + PENDING_INTENT] group atomically without partial D1 state or RAM drift', async () => {
    const { db, fault } = createRealSqliteD1();
    const batcher = new D1AtomicLedgerBatcher(db);
    const ledger = new MicroDoubleEntryLedger('bot-grp-1');
    const cap = BigInt(10_000) * MICRO_USD_PER_USD;
    ledger.depositCapital('init_deposit', cap, 1_000);
    const engine = new PaperOrderLifecycleEngine({ botId: 'bot-grp-1', ledger });
    const dispatchSpy = vi.fn(async (r: OrderRequest): Promise<OrderResult> => ({
      id: 'fill-ok', exchangeId: 'binance', symbol: r.symbol, side: r.side, type: r.type,
      price: r.price ?? 50_000, quantity: r.quantity, filled: r.quantity, fee: 0.25, status: 'filled', timestamp: 2_500,
    }));
    const ctx = buildCtx('bot-grp-1', engine, batcher, dispatchSpy);

    // Statement 5 is inside step 2 (RESERVE_MARGIN), AFTER DEPOSIT_CAPITAL's 4 statements ran.
    fault.failAtBatchIndex = 5;
    await expect(
      executeOrder(ctx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.04 }, 0),
    ).rejects.toThrow(/Durable ledger commit failed: BATCH_ABORTED/);
    expect(dispatchSpy).not.toHaveBeenCalled();

    // Prove ZERO partial durable commit in D1 (init_deposit was NOT stranded in D1)
    const afterAbort = await batcher.loadDurableBotState('bot-grp-1');
    expect(afterAbort?.version).toBe(0);
    expect(afterAbort?.processedEventHashes).toEqual([]);
    expect(afterAbort?.orderIntents).toEqual([]);
    expect(afterAbort?.balances.CASH_AVAILABLE).toBe(ZERO_BIGINT);

    // Prove ZERO RAM drift or phantom compensating journal entries in MicroDoubleEntryLedger
    expect(ledger.getVersion()).toBe(1);
    expect(ledger.getJournalEntries().map((e) => e.eventHash)).toEqual(['init_deposit']);
    expect(ledger.getAccountBalances().CASH_AVAILABLE).toBe(cap);
    expect(ledger.getAccountBalances().MARGIN_RESERVED).toBe(ZERO_BIGINT);

    // Subsequent order after SQLITE_BUSY clears commits full group cleanly with 0n discrepancy
    await executeOrder(ctx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.04 }, 0);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const durableFinal = await batcher.loadDurableBotState('bot-grp-1');
    expect(durableFinal?.version).toBe(ledger.getVersion());
    expect(durableFinal?.balances).toEqual(ledger.getAccountBalances());
    expect(durableFinal?.positions).toEqual(ledger.getAllPositions());
    expect(computeBalanceSheet(durableFinal!.balances).discrepancyMicroUsd).toBe(ZERO_BIGINT);
  });

  it('recovers seamlessly from post-commit pre-ack network drops on both pre-dispatch and post-dispatch without duplicate-hash faults', async () => {
    const { db, fault } = createRealSqliteD1();
    const batcher = new D1AtomicLedgerBatcher(db);
    const ledger = new MicroDoubleEntryLedger('bot-pre-ack');
    ledger.depositCapital('init_deposit', BigInt(10_000) * MICRO_USD_PER_USD, 1_000);
    const engine = new PaperOrderLifecycleEngine({ botId: 'bot-pre-ack', ledger });
    const ctx = buildCtx('bot-pre-ack', engine, batcher);

    fault.crashAfterCommitBeforeAck = true;
    const ord1 = await submitLifecyclePreDispatch(
      ctx, engine, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 0, 50_000, false,
    );
    expect(ord1.clientOrderId).toBe('ord_bot-pre-ack_1');

    fault.crashAfterCommitBeforeAck = true;
    await executeOrder(ctx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 1);
    const durable = await batcher.loadDurableBotState('bot-pre-ack');
    expect(durable?.version).toBe(ledger.getVersion());
    expect(durable?.balances).toEqual(ledger.getAccountBalances());
    expect(durable?.positions?.[0]?.signedQtyBase).toBe((BASE_UNITS_PER_ASSET * BigInt(2)) / BigInt(100));
  });

  it('fails closed on zero-entry reduceOnly intent write failures in cancelLifecycleOrder and releaseLifecycleOnDispatchThrow', async () => {
    const { db, fault } = createRealSqliteD1();
    const batcher = new D1AtomicLedgerBatcher(db);
    const ledger = new MicroDoubleEntryLedger('bot-zero-step');
    ledger.depositCapital('init_deposit', BigInt(10_000) * MICRO_USD_PER_USD, 1_000);
    const engine = new PaperOrderLifecycleEngine({ botId: 'bot-zero-step', ledger });
    const openCtx = buildCtx('bot-zero-step', engine, batcher, async (r) => ({
      id: `v_${r.side}`, exchangeId: 'binance', symbol: r.symbol, side: r.side, type: r.type,
      price: 50_000, quantity: r.quantity, filled: r.side === 'buy' ? r.quantity : 0, fee: 0,
      status: r.side === 'buy' ? 'filled' : 'open', timestamp: 2_000,
    }));

    await executeOrder(openCtx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.04 }, 0);
    await executeOrder(openCtx, { symbol: 'BTC/USDT', side: 'sell', type: 'limit', price: 51_000, quantity: 0.02, reduceOnly: true }, 1);
    const ro2 = await submitLifecyclePreDispatch(
      openCtx, engine, { symbol: 'BTC/USDT', side: 'sell', type: 'limit', price: 52_000, quantity: 0.02, reduceOnly: true }, 2, 52_000, true,
    );

    fault.failAllRuns = true;
    await expect(cancelLifecycleOrder(openCtx, engine, 'v_sell')).rejects.toThrow(/Durable order cancel state update failed/);
    await expect(releaseLifecycleOnDispatchThrow(openCtx, engine, ro2.clientOrderId)).rejects.toThrow(/Durable order release state update failed/);

    // Subsequent tick recoveries commit both queued zero-entry state updates atomically once D1 unlocks
    fault.failAllRuns = false;
    await executeOrder(openCtx, { symbol: 'BTC/USDT', side: 'sell', type: 'limit', price: 50_000, quantity: 0.04, reduceOnly: true }, 3);
    const durable = await batcher.loadDurableBotState('bot-zero-step');
    const byId = new Map(durable!.orderIntents.map((o) => [o.clientOrderId, o.lifecycleState]));
    expect(byId.get('ord_bot-zero-step_2')).toBe('CANCELLED');
    expect(byId.get('ord_bot-zero-step_3')).toBe('REJECTED');
    expect(byId.get('ord_bot-zero-step_4')).toBe('OPEN');
  });
});
