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
import {
  cancelLifecycleOrder, ensureDurableBotHydrated, releaseLifecycleOnDispatchThrow, settleLifecyclePostDispatch, submitLifecyclePreDispatch,
} from './bot-order-lifecycle-bridge';
import {
  buildPendingCommitSteps, flushOrRecoverPostDispatch, getOrCreateSyncCursor,
} from './bot-lifecycle-sync-state';

const requireNode = createRequire(import.meta.url);

function createMemSqlite(): D1DatabaseLike {
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
  const makeStmt = (sql: string, params: readonly unknown[] = []): D1PreparedStatementLike => ({
    bind: (...vals: unknown[]) => makeStmt(sql, vals),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
    all: async <T = unknown>() => ({ results: sqlite.prepare(sql).all(...params) as unknown as T[] }),
    first: async <T = unknown>() => ((sqlite.prepare(sql).get(...params) as unknown as T | undefined) ?? null),
  });
  return {
    prepare: (sql: string) => makeStmt(sql),
    batch: async <T = { meta?: { changes: number } }>(stmts: D1PreparedStatementLike[]) => {
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
}

function mkCtx(
  botId: string, lifecycleEngine: PaperOrderLifecycleEngine, batcher?: D1AtomicLedgerBatcher,
  placeOrder?: (r: OrderRequest) => Promise<OrderResult>,
): OrderContext {
  const cfg = { symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper' as const, strategy: 'grid' as const, capital: 10_000, maxDrawdownPct: 20, gridSpacingPct: 1, gridLevels: 5, capitalPerLevelPct: 10, takeProfitPct: 2, stopLossPct: 2, rebalanceOnFill: true };
  return {
    botId, config: { capital: 10_000, symbol: 'BTC/USDT' },
    state: { id: botId, config: cfg, status: 'running', createdAt: 1_000, startedAt: 1_000, error: null, totalPnl: 0, totalTrades: 0, winCount: 0, lossCount: 0, maxDrawdown: 0, currentDrawdown: 0, stoppedAt: null, lastTickAt: null, lastOrderAt: null, updatedAt: 1_000 },
    deps: {
      exchange: { placeOrder: placeOrder ?? (async (r) => ({ id: 'v_1', exchangeId: 'binance', symbol: r.symbol, side: r.side, type: r.type, price: r.price ?? 50_000, quantity: r.quantity, filled: 0, fee: 0, status: 'open', timestamp: 2_000 })) } as unknown as OrderContext['deps']['exchange'],
      killswitch: { isTradingEnabled: () => true, onOrderPlaced: () => {}, onOrderFilled: () => {}, updateDailyPnl: () => {}, updatePeakCapital: () => {} } as unknown as OrderContext['deps']['killswitch'],
      lifecycleEngine, ...(batcher ? { ledgerBatcher: batcher } : {}),
    },
    onTrade: () => {}, emitTelemetry: () => {}, emitState: () => {},
  };
}

describe('Bot Lifecycle Sync State & Bridge Edge Invariants', () => {
  it('hydrates uninitialized isolate on direct cancelLifecycleOrder and handles cancelled/rejected/expired venue outcomes + duplicate clientOrderId', async () => {
    const db = createMemSqlite();
    const batcher = new D1AtomicLedgerBatcher(db);
    const ledger1 = new MicroDoubleEntryLedger('bot-edge-1');
    ledger1.depositCapital('init_deposit', BigInt(10_000) * MICRO_USD_PER_USD, 1_000);
    const engine1 = new PaperOrderLifecycleEngine({ botId: 'bot-edge-1', ledger: ledger1 });
    const statuses: Array<OrderResult['status']> = ['open', 'cancelled', 'rejected', 'expired'];
    let idx = 0;
    const ctx1 = mkCtx('bot-edge-1', engine1, batcher, async (r) => {
      const st = statuses[idx++] ?? 'open';
      return { id: `v_${idx}`, exchangeId: 'binance', symbol: r.symbol, side: r.side, type: r.type, price: 50_000, quantity: r.quantity, filled: 0, fee: 0, status: st, timestamp: 2_000 + idx };
    });

    await executeOrder(ctx1, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02, clientOrderId: 'custom_1' } as OrderRequest, 0);
    await expect(
      submitLifecyclePreDispatch(ctx1, engine1, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02, clientOrderId: 'custom_1' } as OrderRequest, 1, 50_000),
    ).rejects.toThrow(/DUPLICATE_CLIENT_ORDER_ID \(custom_1\)/);

    await executeOrder(ctx1, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 1);
    await executeOrder(ctx1, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 2);
    await executeOrder(ctx1, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 3);

    // Fresh worker isolate calls cancelLifecycleOrder BEFORE any submitLifecyclePreDispatch
    const engine2 = new PaperOrderLifecycleEngine({ botId: 'bot-edge-1', ledger: new MicroDoubleEntryLedger('bot-edge-1') });
    const ctx2 = mkCtx('bot-edge-1', engine2, batcher);
    await cancelLifecycleOrder(ctx2, engine2, 'custom_1');

    const durable = await batcher.loadDurableBotState('bot-edge-1');
    const stateMap = new Map(durable!.orderIntents.map((o) => [o.clientOrderId, o.lifecycleState]));
    expect(stateMap.get('custom_1')).toBe('CANCELLED');
    expect(stateMap.get('ord_bot-edge-1_2')).toBe('CANCELLED');
    expect(stateMap.get('ord_bot-edge-1_3')).toBe('REJECTED');
    expect(stateMap.get('ord_bot-edge-1_4')).toBe('EXPIRED');
    expect(durable!.balances.MARGIN_RESERVED).toBe(ZERO_BIGINT);
    expect(computeBalanceSheet(durable!.balances).discrepancyMicroUsd).toBe(ZERO_BIGINT);
  });

  it('rehydrates stale same-token isolate on pre-dispatch D1 version advance and halts fail-closed on terminal fill rejection', async () => {
    const db = createMemSqlite();
    const batcher = new D1AtomicLedgerBatcher(db);
    const ledgerA = new MicroDoubleEntryLedger('bot-rehyd');
    ledgerA.depositCapital('init_deposit', BigInt(10_000) * MICRO_USD_PER_USD, 1_000);
    const engineA = new PaperOrderLifecycleEngine({ botId: 'bot-rehyd', ledger: ledgerA });
    const ctxA = mkCtx('bot-rehyd', engineA, batcher);
    await executeOrder(ctxA, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 0);

    // Peer request with same fencingToken = 0 advances D1 from version 2 -> 3 by cancelling ord_bot-rehyd_1
    const engineB = new PaperOrderLifecycleEngine({ botId: 'bot-rehyd', ledger: new MicroDoubleEntryLedger('bot-rehyd') });
    await cancelLifecycleOrder(mkCtx('bot-rehyd', engineB, batcher), engineB, 'ord_bot-rehyd_1');

    // Isolate A's next pre-dispatch sees expectedVersion=2 != D1 version=3, rehydrates to v3, then succeeds on retry!
    await expect(
      executeOrder(ctxA, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 1),
    ).rejects.toThrow(/OPTIMISTIC_CONCURRENCY_OR_CASH_GUARD_FAILED/);
    expect(ledgerA.getVersion()).toBe(3);
    const ord2 = await submitLifecyclePreDispatch(ctxA, engineA, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 2, 50_000);

    // Rejecting ord2 then attempting to settle a late fill on terminal ord2 halts fail-closed
    await releaseLifecycleOnDispatchThrow(ctxA, engineA, ord2.clientOrderId);
    await expect(
      settleLifecyclePostDispatch(ctxA, engineA, ord2, 50_000, { id: 'late_fill', exchangeId: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02, filled: 0.02, fee: 0, status: 'filled', timestamp: 9_000 }),
    ).rejects.toThrow(/Order fill rejected by PaperOrderLifecycleEngine/);
    await expect(ensureDurableBotHydrated(ctxA)).rejects.toThrow(/Durable ledger halted \(fail-closed\)/);
  });

  it('enforces commitAtomicGroup guards and fails closed on pre/post-dispatch cursor-vs-ledger RAM drift', async () => {
    const db = createMemSqlite();
    const batcher = new D1AtomicLedgerBatcher(db);
    await batcher.initializeBotAccount('bot-drift', 1_000, 0);
    expect((await batcher.commitAtomicGroup({ botId: 'bot-drift', expectedVersion: 0, fencingToken: 0, steps: [] })).ok).toBe(false);

    const ledger = new MicroDoubleEntryLedger('bot-drift');
    const dep = ledger.depositCapital('dep_1', BigInt(5_000) * MICRO_USD_PER_USD, 1_000);
    expect(dep.ok && (await batcher.commitAtomicGroup({
      botId: 'bot-drift', expectedVersion: 2, fencingToken: 0,
      steps: [{ entry: dep.data, nextBalances: ledger.getAccountBalances(), requiredCashMicroUsd: ZERO_BIGINT }],
    })).ok).toBe(false);

    const engine = new PaperOrderLifecycleEngine({ botId: 'bot-drift', ledger });
    const ctx = mkCtx('bot-drift', engine, batcher);
    await executeOrder(ctx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 0);

    const cursor = getOrCreateSyncCursor(ledger);
    await flushOrRecoverPostDispatch({ ctx, ledger, batcher, zeroStepErrorPrefix: 'noop', ledgerStepErrorPrefix: 'noop' });
    cursor.version = 0; // Corrupt cursor so pending entries start at v1 while cursor.balances already include v2
    expect(buildPendingCommitSteps(cursor, ledger).ok).toBe(false);
    await expect(
      submitLifecyclePreDispatch(ctx, engine, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 1, 50_000),
    ).rejects.toThrow(/LEDGER_RAM_DRIFT_DETECTED/);

    cursor.haltedError = null;
    cursor.version = -1; // Entry version 1 !== runningVersion + 1 (0) triggers non-contiguous step guard
    expect(buildPendingCommitSteps(cursor, ledger).ok).toBe(false);
    cursor.version = 99; // Version mismatch triggers post-dispatch drift guard
    await expect(
      flushOrRecoverPostDispatch({ ctx, ledger, batcher, zeroStepErrorPrefix: 'z', ledgerStepErrorPrefix: 'Post drift' }),
    ).rejects.toThrow(/Post drift: LEDGER_RAM_DRIFT_DETECTED/);

    // Insufficient free margin rejection + pure in-memory lifecycle (no ledgerBatcher) branches
    const memEngine = new PaperOrderLifecycleEngine({ botId: 'bot-mem' });
    const memCtx = mkCtx('bot-mem', memEngine);
    await expect(
      submitLifecyclePreDispatch(memCtx, memEngine, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 1 }, 0, 50_000),
    ).rejects.toThrow(/Order rejected by PaperOrderLifecycleEngine: INSUFFICIENT_FREE_MARGIN/);
    memEngine.getLedger().depositCapital('mem_dep', BigInt(5_000) * MICRO_USD_PER_USD, 1_000);
    const memOrd = await submitLifecyclePreDispatch(memCtx, memEngine, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 }, 0, 0);
    await settleLifecyclePostDispatch(memCtx, memEngine, memOrd, 50_000, { id: '', exchangeId: 'binance', symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 0, quantity: 0.02, filled: 0.01, fee: 0, status: 'partially_filled', timestamp: 0 });
    await cancelLifecycleOrder(memCtx, memEngine, memOrd.clientOrderId);
    await releaseLifecycleOnDispatchThrow(memCtx, memEngine, memOrd.clientOrderId);
  });
});
