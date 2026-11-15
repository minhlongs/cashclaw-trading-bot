import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createServerClient } from '@/lib/db/client';
import { BotManager, getBotManager, resetBotManager } from '@/tree/bot';
import type { ExchangeOrchestrator } from '@/tree/bot/bot-manager-types';
import type { GridBotConfig, H3MakerBotConfig } from '@/tree/bot/types';
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

// Seed a fresh market ticker so direct placeOrder calls do not rely on synthesizing midPrice when lastTickPrice is null.
async function seedFreshBotTick(bot: { start: () => Promise<void>; pause: () => void }, price = 50_000): Promise<void> {
  interface TickerCapableExchange {
    fetchTicker: (symbol: string) => Promise<{
      symbol: string; last: number; bid: number; ask: number;
      high24h: number; low24h: number; volume24h: number; timestamp: number;
    }>;
  }
  const internalDeps = (bot as unknown as { deps: { exchange?: Partial<TickerCapableExchange> } }).deps;
  if (internalDeps.exchange && typeof internalDeps.exchange.fetchTicker === 'function') {
    vi.spyOn(internalDeps.exchange as TickerCapableExchange, 'fetchTicker').mockResolvedValueOnce({
      symbol: 'BTC/USDT', last: price, bid: price - 1, ask: price + 1, high24h: price + 10, low24h: price - 10, volume24h: 1000, timestamp: Date.now(),
    });
  }
  await bot.start();
  bot.pause();
}

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
    await seedFreshBotTick(bot, 50_000);
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
    const orchestrator = {
      placeOrder: placeOrderSpy,
      fetchTicker: vi.fn(async () => ({
        ok: true as const,
        data: { symbol: 'BTC/USDT', last: 50_000, bid: 49_999, ask: 50_001, high24h: 50_100, low24h: 49_900, volume24h: 1000, timestamp: Date.now() },
      })),
    } as unknown as ExchangeOrchestrator;
    const mgr = new BotManager({ getOrchestrator: () => orchestrator, getD1Database: () => null });
    const bot = await mgr.createBot({ id: 'bot-veto-guard', config: makeGridBotConfig({ capital: 10_000 }), exchangeConfig: PAPER_EXCHANGE_CFG, mode: 'paper' });
    await bot.start();
    bot.pause();

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
      fetchTicker: vi.fn(async () => ({
        ok: true as const,
        data: { symbol: 'BTC/USDT', last: 50_000, bid: 49_999, ask: 50_001, high24h: 50_100, low24h: 49_900, volume24h: 1000, timestamp: Date.now() },
      })),
      placeOrder: vi.fn(async (_ex: string, req: { symbol: string; side: 'buy' | 'sell'; type: 'market' | 'limit'; price?: number; quantity: number }) =>
        nextStatus === 'rejected'
          ? { ok: false as const, error: 'venue rejected order' }
          : { ok: true as const, data: { id: 'ord-c', exchangeId: 'binance', symbol: req.symbol, side: req.side, type: req.type, price: req.price ?? 50_000, quantity: req.quantity, filled: 0, fee: 0, pnl: 0, status: 'cancelled' as const, timestamp: Date.now() } },
      ),
    } as unknown as ExchangeOrchestrator;

    const mgr = new BotManager({ getOrchestrator: () => orchestrator, getD1Database: () => d1 });
    const bot = await mgr.createBot({ id: 'bot-margin-release', config: makeGridBotConfig({ capital: 10_000 }), exchangeConfig: PAPER_EXCHANGE_CFG, mode: 'paper' });
    await bot.start();
    bot.pause();

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

  it('rehydrates durable D1 ledger/orders across BotManager cold restart without overwriting ord_1 and executes live H3MakerStrategy ticks', async () => {
    const d1 = createSqliteD1();
    const mgr1 = new BotManager({ getD1Database: () => d1 });
    const bot1 = await mgr1.createBot({ id: 'bot-cold-rehydrate', config: makeGridBotConfig({ capital: 10_000 }), exchangeConfig: PAPER_EXCHANGE_CFG, mode: 'paper' });
    await seedFreshBotTick(bot1, 50_000);
    expect((await bot1.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'market', price: 50_000, quantity: 0.04 })).status).toBe('filled');
    mgr1.destroy();

    const mgr2 = new BotManager({ getD1Database: () => d1 });
    const bot2 = mgr2.createBotSync({ id: 'bot-cold-rehydrate', config: makeGridBotConfig({ capital: 10_000 }) });
    await seedFreshBotTick(bot2, 51_000);
    expect((await bot2.placeOrder({ symbol: 'BTC/USDT', side: 'sell', type: 'market', price: 51_000, quantity: 0.04 })).status).toBe('filled');
    const durable = await bot2.getLedgerBatcher()!.loadDurableBotState('bot-cold-rehydrate');
    expect(durable?.orderIntents.map((o) => o.clientOrderId)).toEqual(['ord_bot-cold-rehydrate_1', 'ord_bot-cold-rehydrate_2']);
    expect(durable?.balances.REALIZED_PNL).toBe(BigInt(40) * MICRO_USD_PER_USD);
    expect(computeBalanceSheet(durable!.balances).discrepancyMicroUsd).toBe(ZERO_BIGINT);

    let tickPx = 50_000;
    const h3Orch = {
      fetchTicker: vi.fn(async () => ({ ok: true as const, data: { symbol: 'BTC/USDT', last: tickPx, bid: tickPx - 1, ask: tickPx + 1, high24h: tickPx + 10, low24h: tickPx - 10, volume24h: 1000, timestamp: Date.now() } })),
      placeOrder: vi.fn(async (_ex: string, r: { symbol: string; side: 'buy' | 'sell'; type: 'market' | 'limit'; price?: number; quantity: number }) => ({
        ok: true as const, data: { id: `h3-${Date.now()}`, exchangeId: 'binance', symbol: r.symbol, side: r.side, type: r.type, price: r.price ?? tickPx, quantity: r.quantity, filled: r.quantity, fee: 0, pnl: 0, status: 'filled' as const, timestamp: Date.now() },
      })),
    } as unknown as ExchangeOrchestrator;
    const mgrH3 = new BotManager({ getOrchestrator: () => h3Orch, getD1Database: () => d1 });
    const h3Cfg: H3MakerBotConfig = { name: 'H3 Live', symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper', strategy: 'h3_maker', capital: 10_000, maxDrawdownPct: 12, lookbackDays: 3, entryAnnualBps: 800, exitAnnualBps: 150, maxGrossLeverage: 1.0 };
    const h3Bot = await mgrH3.createBot({ id: 'bot-h3-live', config: h3Cfg, exchangeConfig: PAPER_EXCHANGE_CFG, mode: 'paper' });
    await h3Bot.start();
    tickPx = 50_200;
    await h3Bot.tick();
    await vi.waitFor(() => expect(h3Bot.getLifecycleEngine()!.getAllOrders()[0]?.state).toBe('filled'));
    expect(h3Bot.getLifecycleEngine()!.getLedger().getBalanceSheet().discrepancyMicroUsd).toBe(ZERO_BIGINT);
    mgr2.destroy();
    mgrH3.destroy();
  });

  it('completes unmocked H3MakerStrategy buy + reduceOnly sell cycle via default PaperExchangeAdapter, rehydrates fill-vs-limit price drift cleanly, and permits reduceOnly exit during EMERGENCY_HALT', async () => {
    const d1 = createSqliteD1();
    const mgrDefault = new BotManager({ getD1Database: () => d1 });
    const h3Cfg: H3MakerBotConfig = {
      name: 'H3 Unmocked Paper', symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper',
      strategy: 'h3_maker', capital: 10_000, maxDrawdownPct: 12, lookbackDays: 3,
      entryAnnualBps: 800, exitAnnualBps: 150, maxGrossLeverage: 1.0,
    };
    const h3DefaultBot = await mgrDefault.createBot({ id: 'bot-h3-unmocked', config: h3Cfg, exchangeConfig: PAPER_EXCHANGE_CFG, mode: 'paper' });
    let feedPx = 50_000;
    const rawEx = (h3DefaultBot as unknown as { deps: { exchange: { fetchTicker: (s: string) => Promise<unknown> } } }).deps.exchange;
    vi.spyOn(rawEx, 'fetchTicker').mockImplementation(async (symbol: string) => ({
      symbol, last: feedPx, bid: feedPx - 1, ask: feedPx + 1, high24h: feedPx + 10, low24h: feedPx - 10, volume24h: 1000, timestamp: Date.now(),
    }));
    await h3DefaultBot.start();
    feedPx = 50_200;
    await h3DefaultBot.tick();
    await vi.waitFor(() => expect(h3DefaultBot.getLifecycleEngine()!.getAllOrders()[0]?.state).toBe('filled'));
    expect(h3DefaultBot.getLifecycleEngine()!.getLedger().getPosition('BTC/USDT').signedQtyBase).toBeGreaterThan(ZERO_BIGINT);

    await h3DefaultBot.tick();
    await vi.waitFor(() => expect(h3DefaultBot.getLifecycleEngine()!.getAllOrders()[1]?.state).toBe('filled'));
    expect(h3DefaultBot.getLifecycleEngine()!.getAllOrders()[1]?.reduceOnly).toBe(true);
    expect(h3DefaultBot.getLifecycleEngine()!.getLedger().getPosition('BTC/USDT').signedQtyBase).toBe(ZERO_BIGINT);
    expect(h3DefaultBot.getLifecycleEngine()!.getLedger().getBalanceSheet().discrepancyMicroUsd).toBe(ZERO_BIGINT);
    mgrDefault.destroy();

    let fillPx = 49_500;
    const priceImprovementOrch = {
      fetchTicker: vi.fn(async () => ({
        ok: true as const,
        data: { symbol: 'BTC/USDT', last: fillPx, bid: fillPx - 1, ask: fillPx + 1, high24h: fillPx + 10, low24h: fillPx - 10, volume24h: 1000, timestamp: Date.now() },
      })),
      placeOrder: vi.fn(async (_ex: string, r: { symbol: string; side: 'buy' | 'sell'; type: 'market' | 'limit'; price?: number; quantity: number }) => ({
        ok: true as const,
        data: { id: `imp-${Date.now()}-${Math.random()}`, exchangeId: 'binance', symbol: r.symbol, side: r.side, type: r.type, price: fillPx, quantity: r.quantity, filled: r.quantity, fee: 0, pnl: 0, status: 'filled' as const, timestamp: Date.now() },
      })),
    } as unknown as ExchangeOrchestrator;

    const mgrDrift1 = new BotManager({ getOrchestrator: () => priceImprovementOrch, getD1Database: () => d1 });
    const driftBot1 = await mgrDrift1.createBot({ id: 'bot-fill-drift', config: makeGridBotConfig({ capital: 10_000 }), exchangeConfig: PAPER_EXCHANGE_CFG, mode: 'paper' });
    await driftBot1.start();
    driftBot1.pause();
    await driftBot1.placeOrder({ symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.04 });
    mgrDrift1.destroy();

    fillPx = 43_000;
    const mgrDrift2 = new BotManager({ getOrchestrator: () => priceImprovementOrch, getD1Database: () => d1 });
    const driftBot2 = mgrDrift2.createBotSync({ id: 'bot-fill-drift', config: makeGridBotConfig({ capital: 1_000, maxDrawdownPct: 5 }) });
    await driftBot2.start();
    driftBot2.pause();
    const closeUnderHalt = await driftBot2.placeOrder({ symbol: 'BTC/USDT', side: 'sell', type: 'limit', price: 43_000, quantity: 0.04 });
    expect(closeUnderHalt.status).toBe('filled');
    expect(driftBot2.getLifecycleEngine()!.getLedger().getPosition('BTC/USDT').signedQtyBase).toBe(ZERO_BIGINT);
    expect(driftBot2.getLifecycleEngine()!.getLedger().getBalanceSheet().discrepancyMicroUsd).toBe(ZERO_BIGINT);
    const durableDrift = await driftBot2.getLedgerBatcher()!.loadDurableBotState('bot-fill-drift');
    expect(durableDrift?.orderIntents[0]?.limitPriceMicroUsd).toBe(BigInt(49_500) * MICRO_USD_PER_USD);
    expect(computeBalanceSheet(durableDrift!.balances).discrepancyMicroUsd).toBe(ZERO_BIGINT);
    mgrDrift2.destroy();
  });

  it('commits RESERVE_MARGIN + PENDING_INTENT atomically in one D1 batch and rehydrates open H3MakerStrategy position across cold restart', async () => {
    const d1 = createSqliteD1();
    const batchSpy = vi.spyOn(d1, 'batch');
    const mgr1 = new BotManager({ getD1Database: () => d1 });
    const h3Cfg: H3MakerBotConfig = {
      name: 'H3 Cold Resume', symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper',
      strategy: 'h3_maker', capital: 10_000, maxDrawdownPct: 12, lookbackDays: 3,
      entryAnnualBps: 800, exitAnnualBps: 150, maxGrossLeverage: 1.0,
    };
    const bot1 = await mgr1.createBot({ id: 'bot-h3-atomic', config: h3Cfg, exchangeConfig: PAPER_EXCHANGE_CFG, mode: 'paper' });
    let px = 50_000;
    vi.spyOn((bot1 as unknown as { deps: { exchange: { fetchTicker: (s: string) => Promise<unknown> } } }).deps.exchange, 'fetchTicker')
      .mockImplementation(async (symbol: string) => ({ symbol, last: px, bid: px - 1, ask: px + 1, high24h: px + 5, low24h: px - 5, volume24h: 1000, timestamp: Date.now() }));
    await bot1.start();
    px = 50_200;
    batchSpy.mockClear();
    const runSpy = vi.spyOn(d1, 'prepare');
    await bot1.tick();
    await vi.waitFor(() => expect(bot1.getLifecycleEngine()!.getAllOrders()[0]?.state).toBe('filled'));
    expect(batchSpy.mock.calls.length).toBe(3);
    expect(batchSpy.mock.calls[1]?.[0]).toHaveLength(5);
    expect(runSpy).toHaveBeenCalled();
    mgr1.destroy();

    const mgr2 = new BotManager({ getD1Database: () => d1 });
    const bot2 = mgr2.createBotSync({ id: 'bot-h3-atomic', config: h3Cfg });
    bot2.patchState({ status: 'running', startedAt: Date.now() - 60_000 });
    expect(bot2.getSnapshot().status).toBe('running');
    expect(bot2.hasStrategy()).toBe(false);
    vi.spyOn((bot2 as unknown as { deps: { exchange: { fetchTicker: (s: string) => Promise<unknown> } } }).deps.exchange, 'fetchTicker')
      .mockImplementation(async (symbol: string) => ({ symbol, last: px, bid: px - 1, ask: px + 1, high24h: px + 5, low24h: px - 5, volume24h: 1000, timestamp: Date.now() }));
    await bot2.start();
    expect(bot2.hasStrategy()).toBe(true);
    await bot2.tick();
    await vi.waitFor(() => expect(bot2.getLifecycleEngine()!.getAllOrders()[1]?.state).toBe('filled'));
    expect(bot2.getLifecycleEngine()!.getAllOrders()[1]?.side).toBe('sell');
    expect(bot2.getLifecycleEngine()!.getAllOrders()[1]?.reduceOnly).toBe(true);
    expect(bot2.getLifecycleEngine()!.getLedger().getPosition('BTC/USDT').signedQtyBase).toBe(ZERO_BIGINT);
    expect(bot2.getLifecycleEngine()!.getLedger().getBalanceSheet().discrepancyMicroUsd).toBe(ZERO_BIGINT);
    mgr2.destroy();
  });
});
