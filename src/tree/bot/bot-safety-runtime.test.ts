import { describe, expect, it, vi } from 'vitest';
import type { OrderRequest, OrderResult } from '../exchange/types';
import { PaperOrderLifecycleEngine } from '../execution/lifecycle';
import {
  BASE_UNITS_PER_ASSET, D1AtomicLedgerBatcher, MICRO_USD_PER_USD, MicroDoubleEntryLedger,
  ZERO_BIGINT, type D1DatabaseLike, type D1PreparedStatementLike,
} from '../ledger';
import { executeOrder, type OrderContext } from './bot-order-executor';
import { createBotSafetyRuntime } from './bot-safety-runtime';
import { createInitialState } from './bot-state';
import type { GridBotConfig } from './types';

function makeGridCfg(overrides: Partial<GridBotConfig> = {}): GridBotConfig {
  return {
    name: 'Safety Unit Bot', symbol: 'BTC/USDT', exchange: 'binance', mode: 'paper',
    strategy: 'grid', capital: 1_000, maxDrawdownPct: 12, gridSpacingPct: 1,
    gridLevels: 5, capitalPerLevelPct: 10, takeProfitPct: 2, stopLossPct: 2, rebalanceOnFill: true,
    ...overrides,
  };
}

function createPassThroughMockD1(overrides: {
  firstRow?: Record<string, number | string> | null; intentChanges?: number; batchChanges?: number;
} = {}): D1DatabaseLike {
  const buildStmt = (): D1PreparedStatementLike => ({
    bind: () => buildStmt(),
    first: async <T = unknown>() => (overrides.firstRow ?? null) as T | null,
    all: async <T = unknown>() => ({ results: [] as T[] }),
    run: async () => ({ meta: { changes: overrides.intentChanges ?? 1 } }),
  });
  return {
    prepare: () => buildStmt(),
    batch: async <T = { meta?: { changes: number } }>(stmts: D1PreparedStatementLike[]) =>
      stmts.map(() => ({ meta: { changes: overrides.batchChanges ?? 1 } })) as unknown as T[],
  };
}

function makeOrderCtx(
  lifecycleEngine?: PaperOrderLifecycleEngine, ledgerBatcher?: D1AtomicLedgerBatcher,
  placeOrderImpl?: (req: OrderRequest) => Promise<OrderResult>,
): OrderContext {
  const cfg = makeGridCfg();
  const defaultPlace = async (r: OrderRequest): Promise<OrderResult> => ({
    id: 'ord-1', exchangeId: 'binance', symbol: r.symbol, side: r.side, type: r.type,
    price: r.price ?? 50_000, quantity: r.quantity, filled: r.quantity, fee: 0.5, pnl: 0,
    status: 'filled', timestamp: 1_760_000_000_000,
  });
  return {
    deps: {
      exchange: { placeOrder: vi.fn(placeOrderImpl ?? defaultPlace) } as never,
      killswitch: {
        isTradingEnabled: vi.fn(() => true), onOrderFilled: vi.fn(),
        updateDailyPnl: vi.fn(), updatePeakCapital: vi.fn(),
      } as never,
      lifecycleEngine, ledgerBatcher,
    },
    config: { capital: cfg.capital, symbol: cfg.symbol },
    state: createInitialState('bot-u', cfg),
    botId: 'bot-u', onTrade: vi.fn(), emitTelemetry: vi.fn(), emitState: vi.fn(),
  };
}

describe('createBotSafetyRuntime — context provider & exposure mapping', () => {
  it('resolves lastTickPrice, orderHint fallback, multi-asset positions, and peakEquity tracking', () => {
    const cfg = makeGridCfg({ capital: 10_000, symbol: 'BTC/USDT' });
    const state = createInitialState('bot-rt', cfg);
    let lastTick: number | null = null;
    const runtime = createBotSafetyRuntime({
      botId: 'bot-rt', initialCapital: cfg.capital, getConfig: () => cfg,
      getState: () => state, getLastTickPrice: () => lastTick, getD1Database: () => null,
    });

    const emptyCtx = runtime.protectionContextProvider();
    expect(emptyCtx.markets).toEqual({});
    expect(emptyCtx.equityUsd).toBe(10_000);

    state.totalPnl = 500;
    const hintCtx = runtime.protectionContextProvider({ symbol: 'ETH/USDT', price: 3_000 });
    expect(hintCtx.peakEquityUsd).toBe(10_500);
    expect(hintCtx.markets['ETH/USDT']?.midPrice).toBe(3_000);
    expect(hintCtx.markets['BTC/USDT']).toBeUndefined();

    runtime.ledger.applyFill({
      eventHash: 'eth-open', symbol: 'ETH/USDT', side: 'buy', fillQtyBase: BASE_UNITS_PER_ASSET,
      fillPriceMicroUsd: BigInt(2_500) * MICRO_USD_PER_USD, feeMicroUsd: BigInt(1) * MICRO_USD_PER_USD,
      releasedOrderMarginMicroUsd: ZERO_BIGINT, timestampMs: Date.now(),
    });
    runtime.ledger.applyFill({
      eventHash: 'btc-open', symbol: 'BTC/USDT', side: 'buy', fillQtyBase: BigInt(2_000_000),
      fillPriceMicroUsd: BigInt(50_000) * MICRO_USD_PER_USD, feeMicroUsd: ZERO_BIGINT,
      releasedOrderMarginMicroUsd: ZERO_BIGINT, timestampMs: Date.now(),
    });

    const posNoTickCtx = runtime.protectionContextProvider();
    expect(posNoTickCtx.positions).toHaveLength(2);
    expect(posNoTickCtx.positions.find((p) => p.symbol === 'ETH/USDT')?.betaToBtc).toBe(0.8);
    expect(posNoTickCtx.positions.find((p) => p.symbol === 'BTC/USDT')?.betaToBtc).toBe(1.0);
    expect(posNoTickCtx.markets['ETH/USDT']?.midPrice).toBe(2_500);

    lastTick = 52_000;
    expect(runtime.protectionContextProvider({ symbol: 'BTC/USDT', price: 49_000 }).markets['BTC/USDT']?.midPrice).toBe(52_000);
    const crossHintCtx = runtime.protectionContextProvider({ symbol: 'ETH/USDT', price: 3_100 });
    expect(crossHintCtx.markets['ETH/USDT']?.midPrice).toBe(3_100);
    expect(crossHintCtx.markets['BTC/USDT']?.midPrice).toBe(52_000);
  });
});

describe('bot-order-lifecycle-bridge — partial fills, open/expired orders, dispatch throw & D1 error paths', () => {
  it('handles open limit orders, partial fills, expired orders, and custom clientOrderId with D1 batcher', async () => {
    const ledger = new MicroDoubleEntryLedger('bot-u');
    ledger.depositCapital('init_dep', BigInt(50_000) * MICRO_USD_PER_USD, 1_000);
    const lifecycle = new PaperOrderLifecycleEngine({ botId: 'bot-u', ledger });
    const batcher = new D1AtomicLedgerBatcher(createPassThroughMockD1());
    let mode: 'open' | 'partial' | 'expired' = 'open';
    const ctx = makeOrderCtx(lifecycle, batcher, async (r) => {
      if (mode === 'open') {
        return { id: 'v-o', exchangeId: 'binance', symbol: r.symbol, side: r.side, type: r.type, price: r.price ?? 50_000, quantity: r.quantity, filled: 0, status: 'open', timestamp: 0 };
      }
      if (mode === 'partial') {
        return { id: '', exchangeId: 'binance', symbol: r.symbol, side: r.side, type: r.type, price: 0, quantity: r.quantity, filled: r.quantity * 0.5, status: 'partially_filled', timestamp: 0 };
      }
      return { id: 'v-e', exchangeId: 'binance', symbol: r.symbol, side: r.side, type: r.type, price: r.price ?? 50_000, quantity: r.quantity, filled: 0, status: 'expired', timestamp: 1_760_000_005_000 };
    });

    await executeOrder(ctx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.1, clientOrderId: 'custom-open-1' } as OrderRequest, 0);
    expect(lifecycle.getOrder('custom-open-1')?.state).toBe('open');
    mode = 'partial';
    await executeOrder(ctx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.1 }, 1);
    expect(lifecycle.getOrder('ord_bot-u_2')?.state).toBe('partially_filled');
    mode = 'expired';
    await executeOrder(ctx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.1 }, 2);
    expect(lifecycle.getOrder('ord_bot-u_3')?.state).toBe('expired');
    expect(ledger.getBalanceSheet().balanced).toBe(true);
  });

  it('releases reserved margin cleanly when dispatchExchangeOrder throws and surfaces lifecycle/D1 errors fail-closed', async () => {
    const ledger = new MicroDoubleEntryLedger('bot-u');
    ledger.depositCapital('init_dep', BigInt(1_000) * MICRO_USD_PER_USD, 1_000);
    const lifecycle = new PaperOrderLifecycleEngine({ botId: 'bot-u', ledger });
    const capNum = Number(BigInt(1_000) * MICRO_USD_PER_USD);
    const batcher = new D1AtomicLedgerBatcher(createPassThroughMockD1({
      firstRow: { version: 1, fencing_token: 0, cash_micro_usd: capNum, margin_reserved_micro_usd: 0, position_margin_micro_usd: 0, realized_pnl_micro_usd: 0, fees_expense_micro_usd: 0, funding_net_micro_usd: 0, initial_capital_micro_usd: capNum },
    }));

    const throwCtx = makeOrderCtx(lifecycle, batcher, async () => { throw new Error('Exchange socket hang up'); });
    await expect(executeOrder(throwCtx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.01 }, 0)).rejects.toThrow('Exchange socket hang up');
    expect(lifecycle.getOrder('ord_bot-u_1')?.state).toBe('rejected');
    expect(ledger.getAccountBalances().MARGIN_RESERVED).toBe(ZERO_BIGINT);

    await expect(executeOrder(throwCtx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 1.0 }, 1)).rejects.toThrow(/Order rejected by PaperOrderLifecycleEngine/);

    const badBatchLedger = new MicroDoubleEntryLedger('bot-u');
    badBatchLedger.depositCapital('init_dep', BigInt(5_000) * MICRO_USD_PER_USD, 1_000);
    const badBatchCtx = makeOrderCtx(new PaperOrderLifecycleEngine({ botId: 'bot-u', ledger: badBatchLedger }), new D1AtomicLedgerBatcher(createPassThroughMockD1({ batchChanges: 0 })));
    await expect(executeOrder(badBatchCtx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.01 }, 0)).rejects.toThrow(/Durable ledger commit failed/);

    const badIntentLedger = new MicroDoubleEntryLedger('bot-u');
    badIntentLedger.depositCapital('init_dep', BigInt(5_000) * MICRO_USD_PER_USD, 1_000);
    const badIntentCtx = makeOrderCtx(new PaperOrderLifecycleEngine({ botId: 'bot-u', ledger: badIntentLedger }), new D1AtomicLedgerBatcher(createPassThroughMockD1({ intentChanges: 0 })));
    await expect(executeOrder(badIntentCtx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.01 }, 0)).rejects.toThrow(/Durable pending order intent failed/);

    const tightLedger = new MicroDoubleEntryLedger('bot-u');
    tightLedger.depositCapital('init_dep', BigInt(500) * MICRO_USD_PER_USD, 1_000);
    const tightCtx = makeOrderCtx(new PaperOrderLifecycleEngine({ botId: 'bot-u', ledger: tightLedger }), undefined, async (r) => ({
      id: 'huge-fee', exchangeId: 'binance', symbol: r.symbol, side: r.side, type: r.type, price: 50_000, quantity: r.quantity, filled: r.quantity, fee: 100, status: 'filled', timestamp: 1_760_000_000_000,
    }));
    await expect(executeOrder(tightCtx, { symbol: 'BTC/USDT', side: 'buy', type: 'limit', price: 50_000, quantity: 0.01 }, 0)).rejects.toThrow(/Order fill rejected by PaperOrderLifecycleEngine/);
  });
});
