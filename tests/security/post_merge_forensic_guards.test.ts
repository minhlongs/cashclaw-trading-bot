import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { BotManager, resetBotManager } from '@/tree/bot';
import type { ExchangeOrchestrator } from '@/tree/bot/bot-manager-types';
import { createPaperAdapter } from '@/tree/bot/paper-adapter';
import type { GridBotConfig, H3MakerBotConfig } from '@/tree/bot/types';
import {
  MICRO_USD_PER_USD,
  ZERO_BIGINT,
  computeBalanceSheet,
  type D1DatabaseLike,
  type D1PreparedStatementLike,
} from '@/tree/ledger';
import {
  PaperForwardRunner,
  evaluateG13Gate,
  signStrategySpecPayload,
} from '@/tree/paper-forward';
import {
  CloudSchedulerCoordinator,
  type LeaseD1DatabaseLike,
} from '@/ee/scheduler/cloud-scheduler-coordinator';
import {
  canonicalizeNowPaymentsJson,
  computeNowPaymentsHmacSha512,
  detectNowPaymentsUnderpayment,
  verifyAndProcessNowPaymentsIpn,
} from '@/ee/billing/nowpayments-ipn';
import { defaultSaasEntitlementStore } from '@/ee/billing/saas-entitlement-store';
import { defaultCreditLedgerStore } from '@/ee/deliberation-cloud/llm-credit-ledger';
import { cronSchedulerCoordinator, scheduled } from '@/worker-cron';
import type { WorkerEnv } from '@/worker-env';
import { encrypt } from '@/lib/crypto';
import type { Bot, D1Database, D1PreparedStatement } from '@/lib/db/types';

const mockDbRef: { current: D1Database | null } = { current: null };
const mockHeaderMap = new Map<string, string>();
const mockCookieMap = new Map<string, string>();
let nextHeadersInRequestScope = false;

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(() => mockDbRef.current),
}));

vi.mock('@/forest/bot/d1-adapter', () => ({
  hydrateFromD1: vi.fn(async () => {}),
  patchBot: vi.fn(async () => {}),
}));

vi.mock('next/headers', () => ({
  headers: async () => {
    if (!nextHeadersInRequestScope) {
      throw new Error('headers was called outside a request scope');
    }
    return {
      get: (name: string) => mockHeaderMap.get(name.toLowerCase()) ?? null,
    };
  },
  cookies: async () => {
    if (!nextHeadersInRequestScope) {
      throw new Error('cookies was called outside a request scope');
    }
    return {
      get: (name: string) => {
        const val = mockCookieMap.get(name);
        return val !== undefined ? { name, value: val } : undefined;
      },
    };
  },
}));

import { GET as getMetrics } from '@/app/api/metrics/route';
import { POST as postCredits } from '@/app/api/ee/credits/route';
import { POST as postAlerts, defaultAlertDeduplicator } from '@/app/api/ee/alerts/route';
import { middleware } from '@/middleware';
import BacktestsPage from '@/app/[locale]/backtests/page';
import { getBacktestResults } from '@/forest/backtest/actions';

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

const REPO_ROOT = path.resolve(__dirname, '../..');
const MIGRATION_0017_SQL = fs.readFileSync(
  path.join(REPO_ROOT, 'migrations', '0017_paper_ledger_and_leases.sql'),
  'utf8',
);

interface BoundSqlOp {
  readonly sql: string;
  readonly params: readonly SqlPrimitive[];
}

function createSqliteD1(): D1DatabaseLike & LeaseD1DatabaseLike {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(MIGRATION_0017_SQL);
  const buildStmt = (
    sql: string,
    params: readonly unknown[] = [],
  ): D1PreparedStatementLike & { __op: BoundSqlOp } => {
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
        return {
          meta: {
            changes: Number(info.changes),
            last_row_id: Number(info.lastInsertRowid),
          },
        };
      },
    };
  };
  return {
    prepare: (query: string) => buildStmt(query),
    async batch<T = { meta?: { changes: number } }>(
      statements: D1PreparedStatementLike[],
    ): Promise<T[]> {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const out = statements.map((stmt) => {
          const op = (stmt as unknown as { __op: BoundSqlOp }).__op;
          const info = sqlite.prepare(op.sql).run(...op.params);
          return {
            meta: {
              changes: Number(info.changes),
              last_row_id: Number(info.lastInsertRowid),
            },
          };
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

function makeGridConfig(overrides: Partial<GridBotConfig> = {}): GridBotConfig {
  return {
    name: 'Safety Guard Bot',
    symbol: 'BTC/USDT',
    exchange: 'binance',
    mode: 'paper',
    strategy: 'grid',
    capital: 10_000,
    maxDrawdownPct: 12,
    gridSpacingPct: 1,
    gridLevels: 4,
    capitalPerLevelPct: 10,
    takeProfitPct: 2,
    stopLossPct: 2,
    rebalanceOnFill: false,
    ...overrides,
  };
}

const PAPER_EXCHANGE_CFG = {
  apiKey: '',
  apiSecret: '',
  testnet: true,
  sandbox: true,
  rateLimitMs: 50,
};

describe('Post-Merge Runtime, Risk, Ledger, G13 & Tenant Invariant Guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    resetBotManager();
    mockDbRef.current = null;
    mockHeaderMap.clear();
    mockCookieMap.clear();
    nextHeadersInRequestScope = false;
    defaultSaasEntitlementStore.setDatabase(undefined);
    defaultSaasEntitlementStore.resetMemoryForTesting();
    defaultCreditLedgerStore.resetMemoryForTesting();
    cronSchedulerCoordinator.clearLeases();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rejects tickers older than 15,000ms without restamping market snapshot timestamps to nowMs', async () => {
    let tickerTimestamp = Date.now();
    const orchestrator = {
      fetchTicker: vi.fn(async () => ({
        ok: true as const,
        data: {
          symbol: 'BTC/USDT',
          last: 50_000,
          bid: 49_999,
          ask: 50_001,
          high24h: 50_500,
          low24h: 49_500,
          volume24h: 1_000,
          timestamp: tickerTimestamp,
        },
      })),
      placeOrder: vi.fn(async () => ({
        ok: true as const,
        data: {
          id: 'ord-stale-check',
          exchangeId: 'binance',
          symbol: 'BTC/USDT',
          side: 'buy' as const,
          type: 'limit' as const,
          price: 50_000,
          quantity: 0.02,
          filled: 0.02,
          fee: 1,
          pnl: 0,
          status: 'filled' as const,
          timestamp: Date.now(),
        },
      })),
    } as unknown as ExchangeOrchestrator;

    const mgr = new BotManager({ getOrchestrator: () => orchestrator, getD1Database: () => null });
    const bot = await mgr.createBot({
      id: 'bot-stale-ticker',
      config: makeGridConfig(),
      exchangeConfig: PAPER_EXCHANGE_CFG,
      mode: 'paper',
    });

    await bot.start();
    bot.pause();
    bot.patchState({ status: 'running' });

    tickerTimestamp = Date.now() - 30_000;
    await bot.tick();

    await expect(
      bot.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        price: 50_000,
        quantity: 0.02,
      }),
    ).rejects.toThrow(/STALE_DATA_FAIL_CLOSED/);
    expect(orchestrator.placeOrder).not.toHaveBeenCalled();
    mgr.destroy();
  });

  it('fails closed on limit orders when lastTickPrice is null instead of synthesizing midPrice from orderHint.price', async () => {
    const placeOrderSpy = vi.fn(async () => ({
      ok: true as const,
      data: {
        id: 'ord-synthesized-mid',
        exchangeId: 'binance',
        symbol: 'BTC/USDT',
        side: 'buy' as const,
        type: 'limit' as const,
        price: 50_000,
        quantity: 0.02,
        filled: 0.02,
        fee: 1,
        pnl: 0,
        status: 'filled' as const,
        timestamp: Date.now(),
      },
    }));
    const orchestrator = {
      fetchTicker: vi.fn(),
      placeOrder: placeOrderSpy,
    } as unknown as ExchangeOrchestrator;

    const mgr = new BotManager({ getOrchestrator: () => orchestrator, getD1Database: () => null });
    const bot = await mgr.createBot({
      id: 'bot-null-tick',
      config: makeGridConfig(),
      exchangeConfig: PAPER_EXCHANGE_CFG,
      mode: 'paper',
    });

    expect(bot.getLastTickPrice()).toBeNull();
    await expect(
      bot.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        price: 50_000,
        quantity: 0.02,
      }),
    ).rejects.toThrow(/STALE_DATA_FAIL_CLOSED/);
    expect(placeOrderSpy).not.toHaveBeenCalled();
    mgr.destroy();
  });

  it('permits a genuine position-reducing reduceOnly order whose appreciated notional exceeds 25% of NAV', async () => {
    let livePrice = 50_000;
    const orchestrator = {
      fetchTicker: vi.fn(async () => ({
        ok: true as const,
        data: {
          symbol: 'BTC/USDT',
          last: livePrice,
          bid: livePrice - 1,
          ask: livePrice + 1,
          high24h: livePrice + 100,
          low24h: livePrice - 100,
          volume24h: 10_000,
          timestamp: Date.now(),
        },
      })),
      placeOrder: vi.fn(async (_ex: string, req: { side: 'buy' | 'sell'; type: 'market' | 'limit'; price?: number; quantity: number }) => ({
        ok: true as const,
        data: {
          id: `ord-${Date.now()}-${Math.random()}`,
          exchangeId: 'binance',
          symbol: 'BTC/USDT',
          side: req.side,
          type: req.type,
          price: req.price ?? livePrice,
          quantity: req.quantity,
          filled: req.quantity,
          fee: 0,
          pnl: 0,
          status: 'filled' as const,
          timestamp: Date.now(),
        },
      })),
    } as unknown as ExchangeOrchestrator;

    const mgr = new BotManager({ getOrchestrator: () => orchestrator, getD1Database: () => null });
    const bot = await mgr.createBot({
      id: 'bot-appreciated-close',
      config: makeGridConfig({ capital: 10_000 }),
      exchangeConfig: PAPER_EXCHANGE_CFG,
      mode: 'paper',
    });

    await bot.start();
    bot.pause();

    // Open 0.04 BTC @ $50,000 ($2,000 = 20% of $10,000 NAV)
    const entry = await bot.placeOrder({
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      price: 50_000,
      quantity: 0.04,
    });
    expect(entry.status).toBe('filled');

    // Price appreciates to $80,000 -> position is $3,200 out of $11,200 NAV (28.57% > 25% cap)
    livePrice = 80_000;
    bot.patchState({ status: 'running' });
    await bot.tick();
    bot.pause();

    const closeRes = await bot.placeOrder({
      symbol: 'BTC/USDT',
      side: 'sell',
      type: 'limit',
      price: 80_000,
      quantity: 0.04,
      reduceOnly: true,
    });
    expect(closeRes.status).toBe('filled');
    expect(bot.getLifecycleEngine()!.getLedger().getPosition('BTC/USDT').signedQtyBase).toBe(ZERO_BIGINT);
    mgr.destroy();
  });

  it('dispatches only the clipped effectiveQtyBase to the exchange adapter when reduceOnly order quantity exceeds open position', async () => {
    const dispatchedQuantities: number[] = [];
    const orchestrator = {
      fetchTicker: vi.fn(async () => ({
        ok: true as const,
        data: {
          symbol: 'BTC/USDT',
          last: 50_000,
          bid: 49_999,
          ask: 50_001,
          high24h: 50_100,
          low24h: 49_900,
          volume24h: 5_000,
          timestamp: Date.now(),
        },
      })),
      placeOrder: vi.fn(async (_ex: string, req: { side: 'buy' | 'sell'; type: 'market' | 'limit'; price?: number; quantity: number }) => {
        dispatchedQuantities.push(req.quantity);
        return {
          ok: true as const,
          data: {
            id: `ord-clip-${dispatchedQuantities.length}`,
            exchangeId: 'binance',
            symbol: 'BTC/USDT',
            side: req.side,
            type: req.type,
            price: req.price ?? 50_000,
            quantity: req.quantity,
            filled: req.quantity,
            fee: 0,
            pnl: 0,
            status: 'filled' as const,
            timestamp: Date.now(),
          },
        };
      }),
    } as unknown as ExchangeOrchestrator;

    const mgr = new BotManager({ getOrchestrator: () => orchestrator, getD1Database: () => null });
    const bot = await mgr.createBot({
      id: 'bot-ro-clip',
      config: makeGridConfig({ capital: 10_000 }),
      exchangeConfig: PAPER_EXCHANGE_CFG,
      mode: 'paper',
    });

    await bot.start();
    bot.pause();

    await bot.placeOrder({
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      price: 50_000,
      quantity: 0.04,
    });

    await bot.placeOrder({
      symbol: 'BTC/USDT',
      side: 'sell',
      type: 'limit',
      price: 50_000,
      quantity: 0.05,
      reduceOnly: true,
    });

    expect(dispatchedQuantities).toEqual([0.04, 0.04]);
    expect(bot.getLifecycleEngine()!.getLedger().getPosition('BTC/USDT').signedQtyBase).toBe(ZERO_BIGINT);
    mgr.destroy();
  });

  it('releases reserved margin in PaperOrderLifecycleEngine and D1 when strategy cancelOrder cancels a resting limit order', async () => {
    const d1 = createSqliteD1();
    let tickPx = 50_000;
    let orderSeq = 0;
    const cancelSpy = vi.fn(async () => ({ ok: true as const, data: true }));

    const orchestrator = {
      fetchTicker: vi.fn(async () => ({
        ok: true as const,
        data: {
          symbol: 'BTC/USDT',
          last: tickPx,
          bid: tickPx - 1,
          ask: tickPx + 1,
          high24h: tickPx + 50,
          low24h: tickPx - 50,
          volume24h: 2_000,
          timestamp: Date.now(),
        },
      })),
      placeOrder: vi.fn(async (_ex: string, req: { symbol: string; side: 'buy' | 'sell'; type: 'market' | 'limit'; price?: number; quantity: number }) => {
        orderSeq += 1;
        if (orderSeq === 1) {
          return {
            ok: true as const,
            data: {
              id: 'venue-resting-1',
              exchangeId: 'binance',
              symbol: req.symbol,
              side: req.side,
              type: req.type,
              price: req.price ?? tickPx,
              quantity: req.quantity,
              filled: 0,
              fee: 0,
              pnl: 0,
              status: 'open' as const,
              timestamp: Date.now(),
            },
          };
        }
        return { ok: false as const, error: 'second order intentionally rejected after cancel' };
      }),
      cancelOrder: cancelSpy,
    } as unknown as ExchangeOrchestrator;

    const h3Cfg: H3MakerBotConfig = {
      name: 'H3 Cancel Release',
      symbol: 'BTC/USDT',
      exchange: 'binance',
      mode: 'paper',
      strategy: 'h3_maker',
      capital: 10_000,
      maxDrawdownPct: 12,
      lookbackDays: 3,
      entryAnnualBps: 800,
      exitAnnualBps: 150,
      maxGrossLeverage: 1.0,
    };

    const mgr = new BotManager({ getOrchestrator: () => orchestrator, getD1Database: () => d1 });
    const bot = await mgr.createBot({
      id: 'bot-cancel-release',
      config: h3Cfg,
      exchangeConfig: PAPER_EXCHANGE_CFG,
      mode: 'paper',
    });

    await bot.start();
    tickPx = 50_250;
    await bot.tick();
    await vi.waitFor(() =>
      expect(bot.getLifecycleEngine()!.getOrder('ord_bot-cancel-release_1')?.state).toBe('open'),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(bot.getLifecycleEngine()!.getLedger().getAccountBalances().MARGIN_RESERVED).toBeGreaterThan(ZERO_BIGINT);

    // Next tick triggers strategy cancelOrder('venue-resting-1') before attempting replacement order
    tickPx = 50_300;
    await bot.tick();
    await vi.waitFor(() =>
      expect(bot.getLifecycleEngine()!.getOrder('ord_bot-cancel-release_1')?.state).toBe('cancelled'),
    );

    const ledger = bot.getLifecycleEngine()!.getLedger();
    expect(ledger.getAccountBalances().MARGIN_RESERVED).toBe(ZERO_BIGINT);
    expect(ledger.getBalanceSheet().discrepancyMicroUsd).toBe(ZERO_BIGINT);

    const durable = await bot.getLedgerBatcher()!.loadDurableBotState('bot-cancel-release');
    expect(durable?.balances.MARGIN_RESERVED).toBe(ZERO_BIGINT);
    expect(durable?.orderIntents[0]?.lifecycleState).toBe('CANCELLED');
    expect(computeBalanceSheet(durable!.balances).discrepancyMicroUsd).toBe(ZERO_BIGINT);
    mgr.destroy();
  });

  it('computes paper adapter fees in quote USD rather than base asset units for PEPE and BTC orders', async () => {
    const adapter = createPaperAdapter(10_000, { autoFillLimitOrders: true });

    // $100 PEPE order: 10,000,000 PEPE @ $0.00001 -> 0.1% fee = $0.10 USD (not $10,000)
    const pepeOrder = await adapter.placeOrder({
      symbol: 'PEPE/USDT',
      side: 'buy',
      type: 'limit',
      price: 0.00001,
      quantity: 10_000_000,
    });
    expect(pepeOrder.status).toBe('filled');
    expect(pepeOrder.fee).toBeCloseTo(0.10, 6);

    // $1,000 BTC order: 0.02 BTC @ $50,000 -> 0.1% fee = $1.00 USD (not $0.00002)
    const btcOrder = await adapter.placeOrder({
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'market',
      price: 50_000,
      quantity: 0.02,
    });
    expect(btcOrder.status).toBe('filled');
    expect(btcOrder.fee).toBeCloseTo(1.0, 6);
  });

  it('does not increment winCount or totalTrades or reset killswitch consecutive loss streak on open, cancelled, or rejected orders', async () => {
    const responses: Array<{ status: 'filled' | 'open' | 'cancelled' | 'rejected'; filled: number; pnl: number }> = [
      { status: 'filled', filled: 0.01, pnl: -25 },
      { status: 'filled', filled: 0.01, pnl: -30 },
      { status: 'open', filled: 0, pnl: 0 },
      { status: 'cancelled', filled: 0, pnl: 0 },
      { status: 'rejected', filled: 0, pnl: 0 },
    ];
    let idx = 0;

    const orchestrator = {
      fetchTicker: vi.fn(async () => ({
        ok: true as const,
        data: {
          symbol: 'BTC/USDT',
          last: 50_000,
          bid: 49_999,
          ask: 50_001,
          high24h: 50_100,
          low24h: 49_900,
          volume24h: 1_000,
          timestamp: Date.now(),
        },
      })),
      placeOrder: vi.fn(async () => {
        const spec = responses[idx++]!;
        if (spec.status === 'rejected') {
          return { ok: false as const, error: 'venue rejected' };
        }
        return {
          ok: true as const,
          data: {
            id: `ord-metrics-${idx}`,
            exchangeId: 'binance',
            symbol: 'BTC/USDT',
            side: 'buy' as const,
            type: 'limit' as const,
            price: 50_000,
            quantity: 0.01,
            filled: spec.filled,
            fee: 0,
            pnl: spec.pnl,
            status: spec.status,
            timestamp: Date.now(),
          },
        };
      }),
    } as unknown as ExchangeOrchestrator;

    const mgr = new BotManager({ getOrchestrator: () => orchestrator, getD1Database: () => null });
    const bot = await mgr.createBot({
      id: 'bot-unfilled-metrics',
      config: makeGridConfig(),
      exchangeConfig: PAPER_EXCHANGE_CFG,
      mode: 'paper',
    });

    await bot.start();
    bot.pause();

    for (let i = 0; i < responses.length; i += 1) {
      await bot.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        price: 50_000,
        quantity: 0.01,
      });
    }

    const snap = bot.getSnapshot();
    expect(snap.totalTrades).toBe(2);
    expect(snap.lossCount).toBe(2);
    expect(snap.winCount).toBe(0);
    expect(mgr.getKillswitch().getState().consecutiveLosses).toBe(2);
    mgr.destroy();
  });

  it('acquires durable D1 cron lease by default when DB is bound unless CLOUD_LEASE_ENABLED is explicitly false', async () => {
    const d1 = createSqliteD1();
    const nowMs = 1_760_500_000_000;

    // Pre-acquire the cron-queue-drainer lease under another isolate
    const held = await cronSchedulerCoordinator.acquireDurableTickLease(
      {
        botId: 'cron-queue-drainer',
        workspaceId: 'global-cloud',
        isolateId: 'iso-existing-holder',
        nowMs,
      },
      d1,
    );
    expect(held.ok).toBe(true);

    const acquireSpy = vi.spyOn(cronSchedulerCoordinator, 'acquireDurableTickLease');
    const envWithoutFlag: WorkerEnv = {
      DB: d1 as unknown as WorkerEnv['DB'],
      ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('not found', { status: 404 })) },
      ISOLATE_ID: 'iso-contender',
    };

    await scheduled({ scheduledTime: nowMs + 1_000 }, envWithoutFlag);
    expect(acquireSpy).toHaveBeenCalledTimes(1);

    const wranglerRaw = fs.readFileSync(path.join(REPO_ROOT, 'wrangler.jsonc'), 'utf8');
    expect(wranglerRaw).toContain('"CLOUD_LEASE_ENABLED"');
  });

  it('preserves updated per-bot fencing token across D1 hydration so active lease holder commits while stale isolate is fenced out', async () => {
    const d1 = createSqliteD1();
    const coordinator = new CloudSchedulerCoordinator(d1);
    const botId = 'bot-fencing-sync';
    const freshTickerOrch = {
      fetchTicker: vi.fn(async () => ({
        ok: true as const,
        data: {
          symbol: 'BTC/USDT',
          last: 50_000,
          bid: 49_999,
          ask: 50_001,
          high24h: 50_100,
          low24h: 49_900,
          volume24h: 1_000,
          timestamp: Date.now(),
        },
      })),
      placeOrder: vi.fn(async (_ex: string, req: { side: 'buy' | 'sell'; type: 'market' | 'limit'; price?: number; quantity: number }) => ({
        ok: true as const,
        data: {
          id: `fenced-${Date.now()}-${Math.random()}`,
          exchangeId: 'binance',
          symbol: 'BTC/USDT',
          side: req.side,
          type: req.type,
          price: req.price ?? 50_000,
          quantity: req.quantity,
          filled: req.quantity,
          fee: 1,
          pnl: 0,
          status: 'filled' as const,
          timestamp: Date.now(),
        },
      })),
    } as unknown as ExchangeOrchestrator;

    // Isolate A acquires lease with fencingToken = 1
    const leaseA = await coordinator.acquireDurableTickLease({
      botId,
      workspaceId: 'ws-fence',
      isolateId: 'isolate-A',
      nowMs: 10_000,
      leaseDurationMs: 10_000,
    });
    expect(leaseA.ok).toBe(true);
    if (!leaseA.ok) return;
    expect(leaseA.data.fencingToken).toBe(1);

    const mgrA = new BotManager({ getOrchestrator: () => freshTickerOrch, getD1Database: () => d1 });
    const botA = await mgrA.createBot({
      id: botId,
      config: makeGridConfig(),
      exchangeConfig: PAPER_EXCHANGE_CFG,
      mode: 'paper',
    });
    expect(botA.getLifecycleEngine()!.getLedger().updateFencingToken(leaseA.data.fencingToken).ok).toBe(true);
    await botA.start();
    botA.pause();

    const orderA = await botA.placeOrder({
      symbol: 'BTC/USDT',
      side: 'buy',
      type: 'limit',
      price: 50_000,
      quantity: 0.02,
    });
    expect(orderA.status).toBe('filled');

    // Lease expires; Isolate B takes over with fencingToken = 2
    const leaseB = await coordinator.acquireDurableTickLease({
      botId,
      workspaceId: 'ws-fence',
      isolateId: 'isolate-B',
      nowMs: 25_000,
      leaseDurationMs: 10_000,
    });
    expect(leaseB.ok).toBe(true);
    if (!leaseB.ok) return;
    expect(leaseB.data.fencingToken).toBe(2);

    const mgrB = new BotManager({ getOrchestrator: () => freshTickerOrch, getD1Database: () => d1 });
    const botB = await mgrB.createBot({
      id: botId,
      config: makeGridConfig(),
      exchangeConfig: PAPER_EXCHANGE_CFG,
      mode: 'paper',
    });
    expect(botB.getLifecycleEngine()!.getLedger().updateFencingToken(leaseB.data.fencingToken).ok).toBe(true);
    await botB.start();
    botB.pause();

    // Isolate B must succeed with fencingToken = 2 even after hydrating version > 0 from D1
    const orderB = await botB.placeOrder({
      symbol: 'BTC/USDT',
      side: 'sell',
      type: 'limit',
      price: 50_100,
      quantity: 0.02,
      reduceOnly: true,
    });
    expect(orderB.status).toBe('filled');

    // Stale Isolate A (still holding fencingToken = 1) must be blocked by D1 fencing check
    await expect(
      botA.placeOrder({
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'limit',
        price: 50_000,
        quantity: 0.01,
      }),
    ).rejects.toThrow(/Durable (ledger commit|pending order intent) failed/);

    const durable = await botB.getLedgerBatcher()!.loadDurableBotState(botId);
    expect(durable?.fencingToken).toBe(2);
    expect(computeBalanceSheet(durable!.balances).discrepancyMicroUsd).toBe(ZERO_BIGINT);

    mgrA.destroy();
    mgrB.destroy();
  });

  it('counts paper_test bots under bots.running rather than bots.paused in GET /api/metrics', async () => {
    mockDbRef.current = {
      prepare(sql: string): D1PreparedStatement {
        const stmt: D1PreparedStatement = {
          bind: () => stmt,
          first: async <T>() =>
            ({ total_trades: 4, total_pnl: 25, wins: 3, losses: 1 } as unknown as T),
          firstRow: async <T>() => stmt.first<T>(),
          all: async <T>() => {
            if (sql.includes('GROUP BY status')) {
              return {
                results: [
                  { status: 'paper_test', count: 3 },
                  { status: 'paused', count: 1 },
                ] as unknown as T[],
                meta: { duration: 1 },
              };
            }
            return { results: [] as T[], meta: { duration: 1 } };
          },
          run: async () => ({ meta: { changes: 0, last_row_id: 0, duration: 1 } }),
        };
        return stmt;
      },
      batch: async () => [],
      exec: async () => ({ count: 0, duration: 1 }),
      dump: async () => '',
    };

    const res = await getMetrics(
      new Request('http://localhost/api/metrics', { headers: { 'x-user-id': 'usr_metrics' } }),
    );
    const body = (await res.json()) as { bots: { total: number; running: number; paused: number } };
    expect(body.bots).toEqual({ total: 4, running: 3, paused: 1 });
  });

  it('refuses non-contiguous day jumps in PaperForwardRunner.stepDay and preserves hidden .g13-cache artifacts in workflow config', () => {
    const genesisMs = 1_794_614_400_000;
    const dayMs = 86_400_000;
    const spec = signStrategySpecPayload({
      specVersion: '1.0.0',
      strategyId: 'H3_MAKER',
      executionMode: 'PAPER_ONLY',
      liveOrderAuthority: false,
      aiOrderAuthority: false,
      universe: ['BNBUSDT'],
      parameters: {
        lookbackDays: 30,
        entryAnnualBps: 800,
        exitAnnualBps: 150,
        fifoFillProbability: 0.75,
        adverseSelectionBps: 1.2,
        singleLegMissProbability: 0.05,
        maxGrossLeverage: 1.0,
      },
      venueSchedule: {
        primaryVenue: 'hyperliquid',
        benchmarkVenue: 'binance',
        spotMakerBps: 1.5,
        perpMakerBps: 1.0,
        spotTakerBps: 10.0,
        perpTakerBps: 4.5,
      },
      riskGates: {
        maxDrawdownSoftPct: 8.0,
        maxDrawdownHardPct: 12.0,
        maxDailyLossPct: 2.5,
        staleDataCutoffMs: 15_000,
        maxTrackingErrorBpsPerMonth: 15.0,
      },
      observationWindow: {
        minRequiredDays: 60,
        targetDays: 90,
      },
    });

    const runner = new PaperForwardRunner({
      spec,
      initialCapitalUsd: 100_000,
      genesisTimestampMs: genesisMs,
    });
    const cp0 = runner.recordGenesisCheckpoint(genesisMs);

    expect(() =>
      runner.stepDay({
        dayIndex: 61,
        timestampMs: genesisMs + 61 * dayMs,
        observations: [
          {
            symbol: 'BNBUSDT',
            spotMidUsd: 610,
            perpMidUsd: 612,
            impliedCarryAnnualBps: 900,
            fundingIntervalsBps: [1.0, 1.0, 1.0],
          },
        ],
      }),
    ).toThrow(/contiguous/i);

    const syntheticJumpVerdict = evaluateG13Gate({
      paperCheckpoints: [
        cp0,
        {
          ...cp0,
          dayIndex: 61,
          timestampMs: genesisMs + 61 * dayMs,
        },
      ],
      oracleCheckpoints: [
        { dayIndex: 0, oracleNav: 100_000 },
        { dayIndex: 61, oracleNav: 100_000 },
      ],
    });
    expect(syntheticJumpVerdict.verdict).toBe('FAIL');
    expect(syntheticJumpVerdict.g13Pass).toBe(false);

    const workflowYaml = fs.readFileSync(
      path.join(REPO_ROOT, '.github', 'workflows', 'g13-paper-forward.yml'),
      'utf8',
    );
    expect(workflowYaml).toMatch(/include-hidden-files:\s*true/);
  });

  it('rejects non-USD NOWPayments callbacks missing both outcome_amount and price_amount instead of activating MASTER tier', async () => {
    const secret = 'ipn-non-usd-guard-secret';
    const rawPayload = {
      payment_id: 'pay_btc_dust_001',
      payment_status: 'finished' as const,
      order_id: 'ord_master_299',
      pay_amount: 0.00001,
      actually_paid: 0.00001,
      pay_currency: 'btc',
    };

    const mismatch = detectNowPaymentsUnderpayment(rawPayload, 299);
    expect(mismatch).not.toBeNull();

    const sig = await computeNowPaymentsHmacSha512(
      canonicalizeNowPaymentsJson(rawPayload),
      secret,
    );
    const verified = await verifyAndProcessNowPaymentsIpn(
      rawPayload,
      sig,
      secret,
      new Set<string>(),
      {
        workspaceId: 'ws_dust_attacker',
        targetTier: 'MASTER',
        expectedAmountUsd: 299,
      },
    );
    expect(verified.ok).toBe(false);
  });

  it('rejects BASIC tier managed credit debits with 403 and blocks unprivileged client allowNegativeRoiResearch bypass', async () => {
    await defaultSaasEntitlementStore.recordIpnAndUpgradeTier({
      paymentId: 'pay_basic_seed',
      workspaceId: 'ws_basic_credits',
      targetTier: 'BASIC',
      paymentStatus: 'finished',
      payAmount: 0,
      payCurrency: 'USDT',
    });
    await defaultSaasEntitlementStore.recordIpnAndUpgradeTier({
      paymentId: 'pay_prem_seed',
      workspaceId: 'ws_prem_credits',
      targetTier: 'PREMIUM',
      paymentStatus: 'finished',
      payAmount: 29,
      payCurrency: 'USDT',
    });

    const basicFastRes = await postCredits(
      new Request('http://localhost/api/ee/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws_basic_credits',
          modelTier: 'FAST',
          promptTokens: 1_000,
          completionTokens: 500,
        }),
      }),
    );
    expect(basicFastRes.status).toBe(403);

    vi.stubEnv('ADMIN_TOKEN', 'server-operator-secret-token');
    const unprivOverrideRes = await postCredits(
      new Request('http://localhost/api/ee/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws_prem_credits',
          modelTier: 'REASONING',
          promptTokens: 1_500,
          completionTokens: 500,
          allowNegativeRoiResearch: true,
        }),
      }),
    );
    expect(unprivOverrideRes.status).toBe(403);
    const unprivBody = (await unprivOverrideRes.json()) as { code?: string };
    expect(unprivBody.code).toBe('MULTI_AGENT_DEBATE_DISABLED_NEGATIVE_ROI');

    const authorizedOverrideRes = await postCredits(
      new Request('http://localhost/api/ee/credits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer server-operator-secret-token',
        },
        body: JSON.stringify({
          workspaceId: 'ws_prem_credits',
          modelTier: 'REASONING',
          promptTokens: 1_500,
          completionTokens: 500,
          allowNegativeRoiResearch: true,
        }),
      }),
    );
    expect(authorizedOverrideRes.status).toBe(200);
  });

  it('blocks BASIC tier from signing arbitrary payloads with global CASHCLAW_ALERT_WEBHOOK_SECRET on POST /api/ee/alerts', async () => {
    vi.stubEnv('CASHCLAW_ALERT_WEBHOOK_SECRET', 'global-platform-alert-hmac-secret');
    await defaultSaasEntitlementStore.recordIpnAndUpgradeTier({
      paymentId: 'pay_basic_alert_seed',
      workspaceId: 'ws_basic_oracle_probe',
      targetTier: 'BASIC',
      paymentStatus: 'finished',
      payAmount: 0,
      payCurrency: 'USDT',
    });

    const res = await postAlerts(
      new Request('http://localhost/api/ee/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: `evt_basic_probe_${Date.now()}`,
          workspaceId: 'ws_basic_oracle_probe',
          botId: 'bot_probe_1',
          channel: 'TELEGRAM',
          message: 'Attempted global HMAC signing oracle',
          timestampMs: 1_775_000_000_000,
        }),
      }),
    );

    expect([402, 403]).toContain(res.status);
    const body = (await res.json()) as { ok: boolean; signatureHex?: string; envelope?: unknown };
    expect(body.ok).toBe(false);
    expect(body.signatureHex).toBeUndefined();
    expect(body.envelope).toBeUndefined();
    void defaultAlertDeduplicator;
  });

  it('throws fail-closed from encrypt() in production when ENCRYPTION_KEY is missing or invalid', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.ENCRYPTION_KEY;
    await expect(encrypt('exchange-api-secret')).rejects.toThrow();

    vi.stubEnv('ENCRYPTION_KEY', btoa('too-short-key'));
    await expect(encrypt('exchange-api-secret')).rejects.toThrow();
  });

  it('strips spoofed x-user-id headers on non-API routes and scopes backtests page and actions to authenticated tenant', async () => {
    const victimBot: Bot = {
      id: 'bot_victim_only',
      user_id: 'usr_victim',
      name: 'Victim Private Bot',
      strategy: 'grid',
      pair: 'BTC/USDT',
      exchange: 'binance',
      status: 'paper_test',
      config_json: '{"secretParam":42}',
      capital_allocated: 25_000,
      capital_used: 5_000,
      total_pnl: 400,
      win_count: 4,
      loss_count: 1,
      max_drawdown: 1.2,
      total_trades: 5,
      started_at: 1_000,
      stopped_at: null,
      last_error: null,
      last_tick_at: 2_000,
      last_order_at: 2_000,
      current_drawdown: 0,
      created_at: 1_000,
      updated_at: 2_000,
    };
    const aliceBot: Bot = {
      ...victimBot,
      id: 'bot_alice_only',
      user_id: 'usr_alice',
      name: 'Alice Own Bot',
    };

    mockDbRef.current = {
      prepare(sql: string): D1PreparedStatement {
        let params: unknown[] = [];
        const stmt: D1PreparedStatement = {
          bind(...values: unknown[]) {
            params = values;
            return stmt;
          },
          first: async <T>() => {
            if (sql.includes('FROM bots WHERE id = ?')) {
              const id = String(params[0] ?? '');
              const found = [victimBot, aliceBot].find((b) => b.id === id) ?? null;
              return found as unknown as T;
            }
            return null;
          },
          firstRow: async <T>() => stmt.first<T>(),
          all: async <T>() => {
            if (sql.includes('FROM user_sessions')) {
              const sid = String(params[0] ?? '');
              const rows =
                sid === 'sess_alice'
                  ? [{ user_id: 'usr_alice', expires_at: Math.floor(Date.now() / 1000) + 3600 }]
                  : [];
              return { results: rows as unknown as T[], meta: { duration: 1 } };
            }
            if (sql.includes('FROM bots WHERE user_id = ?')) {
              const uid = String(params[0] ?? '');
              return {
                results: [victimBot, aliceBot].filter((b) => b.user_id === uid) as unknown as T[],
                meta: { duration: 1 },
              };
            }
            if (sql.includes('FROM bots')) {
              return { results: [victimBot, aliceBot] as unknown as T[], meta: { duration: 1 } };
            }
            if (sql.includes('FROM backtest_results')) {
              const requestedBotId = String(params[0] ?? '');
              const scopedUserId = params.length > 1 ? String(params[1] ?? '') : undefined;
              const owner = [victimBot, aliceBot].find((b) => b.id === requestedBotId)?.user_id;
              if (scopedUserId && owner !== scopedUserId) {
                return { results: [] as T[], meta: { duration: 1 } };
              }
              return {
                results: [{ id: `bt_${requestedBotId}`, bot_id: requestedBotId }] as unknown as T[],
                meta: { duration: 1 },
              };
            }
            return { results: [] as T[], meta: { duration: 1 } };
          },
          run: async () => ({ meta: { changes: 1, last_row_id: 1, duration: 1 } }),
        };
        return stmt;
      },
      batch: async () => [],
      exec: async () => ({ count: 0, duration: 1 }),
      dump: async () => '',
    };

    const spoofPageReq = new NextRequest('http://localhost/en/backtests', {
      headers: { accept: 'text/html', 'x-user-id': 'usr_victim' },
    });
    const mwRes = await middleware(spoofPageReq);
    const overrideList = mwRes.headers.get('x-middleware-override-headers');
    expect(overrideList).not.toBeNull();
    expect(overrideList).not.toContain('x-user-id');
    expect(mwRes.headers.get('x-middleware-request-x-user-id')).toBeNull();

    nextHeadersInRequestScope = true;
    mockHeaderMap.set('x-user-id', 'usr_alice');
    mockCookieMap.set('session_id', 'sess_alice');

    const element = (await BacktestsPage()) as { props?: { children?: { props?: { initialBots?: Array<{ id: string }> } } } };
    const initialBots = element?.props?.children?.props?.initialBots ?? [];
    expect(initialBots.map((b) => b.id)).toEqual(['bot_alice_only']);

    const crossTenantResults = await getBacktestResults('bot_victim_only');
    expect(crossTenantResults).toEqual([]);

    const ownResults = await getBacktestResults('bot_alice_only');
    expect(ownResults).toHaveLength(1);
  });
});
