import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerClient } from '@/lib/db/client';
import { BotManager, getBotManager, resetBotManager } from '@/tree/bot';
import type { ExchangeOrchestrator } from '@/tree/bot/bot-manager-types';
import type { GridBotConfig } from '@/tree/bot/types';
import {
  BASE_UNITS_PER_ASSET, MICRO_USD_PER_USD, ZERO_BIGINT, computeBalanceSheet,
  type D1DatabaseLike, type D1PreparedStatementLike,
} from '@/tree/ledger';

vi.mock('@/lib/db/client', () => ({ createServerClient: vi.fn(() => null) }));
vi.mock('@/forest/bot/d1-adapter', () => ({ hydrateFromD1: vi.fn(async () => {}), patchBot: vi.fn(async () => {}) }));

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
const { DatabaseSync } = nodeRequire('node:sqlite') as { DatabaseSync: new (location: string) => SqliteDatabaseSyncLike };
const MIGRATION_0017_SQL = fs.readFileSync(path.resolve(__dirname, '../../migrations/0017_paper_ledger_and_leases.sql'), 'utf8');
interface BoundSqlOp { readonly sql: string; readonly params: readonly SqlPrimitive[]; }

function createSqliteD1(): D1DatabaseLike {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(MIGRATION_0017_SQL);
  const buildStmt = (sql: string, params: readonly unknown[] = []): D1PreparedStatementLike & { __op: BoundSqlOp } => {
    const typedParams = params as readonly SqlPrimitive[];
    return {
      __op: { sql, params: typedParams },
      bind: (...values: unknown[]) => buildStmt(sql, values),
      first: async <T = unknown>() => {
        const row = sqlite.prepare(sql).get(...typedParams) as T | undefined;
        return row ? ({ ...(row as object) } as T) : null;
      },
      all: async <T = unknown>() => {
        const rows = sqlite.prepare(sql).all(...typedParams) as T[];
        return { results: rows.map((r) => ({ ...(r as object) } as T)) };
      },
      run: async () => {
        const info = sqlite.prepare(sql).run(...typedParams);
        return { meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
      },
    };
  };
  return {
    prepare: (query: string) => buildStmt(query),
    async batch<T = { meta?: { changes: number } }>(statements: D1PreparedStatementLike[]): Promise<T[]> {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const out = statements.map((stmt) => {
          const op = (stmt as unknown as { __op: BoundSqlOp }).__op;
          const info = sqlite.prepare(op.sql).run(...op.params);
          return { meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } };
        });
        sqlite.exec('COMMIT');
        return out as T[];
      } catch (err) {
        if (sqlite.isTransaction) sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

function makeGridBotConfig(overrides: Partial<GridBotConfig> = {}): GridBotConfig {
  return {
    name: 'Live Safety Bot', symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper',
    strategy: 'grid', capital: 10_000, maxDrawdownPct: 12, gridSpacingPct: 1,
    gridLevels: 5, capitalPerLevelPct: 10, takeProfitPct: 2, stopLossPct: 2, rebalanceOnFill: true,
    ...overrides,
  };
}
const PAPER_EXCHANGE_CFG = { apiKey: '', apiSecret: '', testnet: true, sandbox: true, rateLimitMs: 50 };

describe('Live BotManager Runtime Safety Integration (Unmocked BotInstance & Factory)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetBotManager();
    vi.mocked(createServerClient).mockReturnValue(null);
  });

  it('wires real CapitalProtectionEngine, PaperOrderLifecycleEngine, and balanced MicroDoubleEntryLedger in createBot & createBotSync', async () => {
    const mgr = getBotManager();
    const asyncBot = await mgr.createBot({ id: 'bot-live-async', config: makeGridBotConfig({ capital: 10_000 }), exchangeConfig: PAPER_EXCHANGE_CFG, mode: 'paper' });
    expect(asyncBot.getProtectionEngine()).toBeDefined();
    expect(asyncBot.getLifecycleEngine()).toBeDefined();
    expect(asyncBot.getLedgerBatcher()).toBeUndefined();
    expect(asyncBot.getLastTickPrice()).toBeNull();
    const asyncSheet = asyncBot.getLifecycleEngine()!.getLedger().getBalanceSheet();
    expect(asyncSheet.balanced).toBe(true);
    expect(asyncSheet.discrepancyMicroUsd).toBe(ZERO_BIGINT);
    expect(asyncSheet.equityMicroUsd).toBe(BigInt(10_000) * MICRO_USD_PER_USD);

    const syncBot = mgr.createBotSync({ id: 'bot-live-sync', config: makeGridBotConfig({ capital: 25_000, symbol: 'ETH/USDT' }) });
    expect(syncBot.getProtectionEngine()).toBeDefined();
    expect(syncBot.getLifecycleEngine()).toBeDefined();
    expect(syncBot.getLifecycleEngine()!.getLedger().getBalanceSheet().discrepancyMicroUsd).toBe(ZERO_BIGINT);
    mgr.destroy();
  });

  it('executes valid <= 25% NAV paper orders, updates lifecycle to filled, preserves 0n ledger balance, and commits atomically to D1', async () => {
    const d1 = createSqliteD1();
    vi.mocked(createServerClient).mockReturnValue(d1 as unknown as ReturnType<typeof createServerClient>);
    const mgr = new BotManager();
    const bot = await mgr.createBot({ id: 'bot-d1-wired', config: makeGridBotConfig({ capital: 10_000 }), exchangeConfig: PAPER_EXCHANGE_CFG, mode: 'paper' });
    const batcher = bot.getLedgerBatcher();
    expect(batcher).toBeDefined();

    const buyResult = await bot.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market', price: 50_000, quantity: 0.04 });
    expect(buyResult.status).toBe('filled');
    const lifecycle = bot.getLifecycleEngine()!;
    expect(lifecycle.getOrder('ord_bot-d1-wired_1')?.state).toBe('filled');
    expect(lifecycle.getOrder('ord_bot-d1-wired_1')?.filledQtyBase).toBe(BigInt(4_000_000));

    const sellResult = await bot.placeOrder({ symbol: 'BTC/USDT', side: 'sell', type: 'market', price: 51_000, quantity: 0.04 });
    expect(sellResult.status).toBe('filled');
    const ledger = lifecycle.getLedger();
    expect(ledger.getBalanceSheet().balanced).toBe(true);
    expect(ledger.getBalanceSheet().discrepancyMicroUsd).toBe(ZERO_BIGINT);
    expect(ledger.getPosition('BTC/USDT').signedQtyBase).toBe(ZERO_BIGINT);
    expect(ledger.getAccountBalances().REALIZED_PNL).toBe(BigInt(40) * MICRO_USD_PER_USD);

    const durable = await batcher!.loadDurableBotState('bot-d1-wired');
    expect(durable?.orderIntents).toHaveLength(2);
    expect(durable!.orderIntents.every((o) => o.lifecycleState === 'FILLED')).toBe(true);
    expect(computeBalanceSheet(durable!.balances).discrepancyMicroUsd).toBe(ZERO_BIGINT);
    expect(durable!.balances).toEqual(ledger.getAccountBalances());
    mgr.destroy();
  });

  it('vetoes oversized (> 25% NAV) orders and global kill-switch pre-trade before exchange.placeOrder is ever called', async () => {
    const placeOrderSpy = vi.fn();
    const orchestrator = { placeOrder: placeOrderSpy, fetchTicker: vi.fn() } as unknown as ExchangeOrchestrator;
    const mgr = new BotManager({ getOrchestrator: () => orchestrator, getD1Database: () => null });
    const bot = await mgr.createBot({ id: 'bot-veto-guard', config: makeGridBotConfig({ capital: 10_000 }), exchangeConfig: PAPER_EXCHANGE_CFG, mode: 'paper' });

    await expect(bot.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.06 })).rejects.toThrow(/CapitalProtectionEngine \(REJECT_PRETRADE\)/);
    expect(placeOrderSpy).not.toHaveBeenCalled();

    bot.getProtectionEngine()!.setGlobalKillSwitch(true);
    await expect(bot.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.01 })).rejects.toThrow(/CapitalProtectionEngine \(GLOBAL_KILL_SWITCH\)/);
    expect(placeOrderSpy).not.toHaveBeenCalled();
    expect(bot.getLifecycleEngine()!.getLedger().getBalanceSheet().discrepancyMicroUsd).toBe(ZERO_BIGINT);
    expect(bot.getLifecycleEngine()!.getAllOrders()).toHaveLength(0);
    mgr.destroy();
  });

  it('releases reserved margin cleanly with 0n discrepancy when exchange rejects or cancels an order', async () => {
    const d1 = createSqliteD1();
    let nextStatus: 'rejected' | 'cancelled' = 'rejected';
    const orchestrator = {
      placeOrder: vi.fn(async (_ex: string, req: { symbol: string; side: 'buy' | 'sell'; type: 'market' | 'limit'; price?: number; quantity: number }) =>
        nextStatus === 'rejected'
          ? { ok: false as const, error: 'venue rejected order' }
          : { ok: true as const, data: { id: 'ord-c', exchangeId: 'binance', symbol: req.symbol, side: req.side, type: req.type, price: req.price ?? 50_000, quantity: req.quantity, filled: 0, fee: 0, pnl: 0, status: 'cancelled' as const, timestamp: Date.now() } },
      ),
    } as unknown as ExchangeOrchestrator;

    const mgr = new BotManager({ getOrchestrator: () => orchestrator, getD1Database: () => d1 });
    const bot = await mgr.createBot({ id: 'bot-margin-release', config: makeGridBotConfig({ capital: 10_000 }), exchangeConfig: PAPER_EXCHANGE_CFG, mode: 'paper' });

    expect((await bot.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 })).status).toBe('rejected');
    nextStatus = 'cancelled';
    expect((await bot.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.02 })).status).toBe('cancelled');

    const lifecycle = bot.getLifecycleEngine()!;
    expect(lifecycle.getOrder('ord_bot-margin-release_1')?.state).toBe('rejected');
    expect(lifecycle.getOrder('ord_bot-margin-release_2')?.state).toBe('cancelled');
    expect(lifecycle.getLedger().getAccountBalances().MARGIN_RESERVED).toBe(ZERO_BIGINT);
    expect(lifecycle.getLedger().getBalanceSheet().discrepancyMicroUsd).toBe(ZERO_BIGINT);

    const durable = await bot.getLedgerBatcher()!.loadDurableBotState('bot-margin-release');
    expect(durable?.orderIntents.map((o) => o.lifecycleState)).toEqual(['REJECTED', 'CANCELLED']);
    expect(computeBalanceSheet(durable!.balances).discrepancyMicroUsd).toBe(ZERO_BIGINT);
    expect(BASE_UNITS_PER_ASSET).toBe(BigInt(100_000_000));
    mgr.destroy();
  });
});
