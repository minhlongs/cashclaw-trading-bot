import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  orderResultToTrade,
  executeOrder,
  type OrderContext,
} from './bot-order-executor';
import type { OrderRequest, OrderResult } from '../exchange/types';
import type { BotState } from './types';

// ── Shared fixtures ──────────────────────────────────────────────────────────

function makeResult(overrides: Partial<OrderResult> = {}): OrderResult {
  return {
    id: 'order-abc',
    exchangeId: 'binance',
    symbol: 'BTC/USDT',
    side: 'buy',
    type: 'limit',
    price: 60000,
    quantity: 0.1,
    filled: 0.1,
    fee: 3,
    pnl: 50,
    status: 'filled',
    timestamp: 1700000000000,
    ...overrides,
  };
}

function freshState(): BotState {
  return {
    lastOrderAt: 0,
    totalTrades: 0,
    totalPnl: 0,
    winCount: 0,
    lossCount: 0,
    updatedAt: 0,
  } as unknown as BotState;
}

function makeContext(overrides: Partial<OrderContext> = {}): OrderContext {
  const exchange = { placeOrder: vi.fn().mockResolvedValue(makeResult()) };
  const killswitch = {
    isTradingEnabled: vi.fn().mockReturnValue(true),
    onOrderFilled: vi.fn(),
    updateDailyPnl: vi.fn(),
    updatePeakCapital: vi.fn(),
  };

  return {
    deps: {
      exchange: exchange as never,
      killswitch: killswitch as never,
    },
    config: { capital: 1000, symbol: 'BTC/USDT' },
    state: freshState(),
    botId: 'bot-1',
    onTrade: vi.fn(),
    emitTelemetry: vi.fn(),
    emitState: vi.fn(),
    ...overrides,
  };
}

// ── orderResultToTrade ───────────────────────────────────────────────────────

describe('orderResultToTrade', () => {
  const result = makeResult();
  const trade = orderResultToTrade(result, 'bot-x', 7);

  it('generates the trade ID from botId and orderCounter', () => {
    expect(trade.id).toBe('trade_bot-x_7');
  });

  it('maps all fields from OrderResult', () => {
    expect(trade.botId).toBe('bot-x');
    expect(trade.exchangeId).toBe(result.exchangeId);
    expect(trade.symbol).toBe(result.symbol);
    expect(trade.side).toBe(result.side);
    expect(trade.type).toBe(result.type);
    expect(trade.price).toBe(result.price);
    expect(trade.quantity).toBe(result.quantity);
    expect(trade.filled).toBe(result.filled);
    expect(trade.timestamp).toBe(result.timestamp);
  });

  it('defaults fee to 0 when not provided', () => {
    const noFee = makeResult({ fee: undefined });
    const t = orderResultToTrade(noFee, 'b', 1);
    expect(t.fee).toBe(0);
  });

  it('defaults pnl to 0 when not provided', () => {
    const noPnl = makeResult({ pnl: undefined });
    const t = orderResultToTrade(noPnl, 'b', 1);
    expect(t.pnl).toBe(0);
  });

  it('preserves fee and pnl when present', () => {
    expect(trade.fee).toBe(3);
    expect(trade.pnl).toBe(50);
  });

  it('casts status to BotTrade status literal', () => {
    const r = makeResult({ status: 'filled' });
    const t = orderResultToTrade(r, 'b', 1);
    expect(t.status).toBe('filled');
  });

  it('different counters produce different IDs', () => {
    const t1 = orderResultToTrade(result, 'b', 1);
    const t2 = orderResultToTrade(result, 'b', 2);
    expect(t1.id).not.toBe(t2.id);
  });
});

// ── executeOrder ─────────────────────────────────────────────────────────────

describe('executeOrder', () => {
  let ctx: OrderContext;
  let req: OrderRequest;

  beforeEach(() => {
    ctx = makeContext();
    req = {
      symbol: 'BTC/USDT',
      exchange: 'binance',
      side: 'buy',
      type: 'limit',
      price: 60000,
      quantity: 0.1,
    };
  });

  it('throws when killswitch halts trading', async () => {
    ctx.deps.killswitch.isTradingEnabled = vi.fn().mockReturnValue(false);

    await expect(executeOrder(ctx, req, 0)).rejects.toThrow('Trading halted by killswitch');
  });

  it('does not call exchange when killswitch halts trading', async () => {
    ctx.deps.killswitch.isTradingEnabled = vi.fn().mockReturnValue(false);

    await expect(executeOrder(ctx, req, 0)).rejects.toThrow();
    expect(ctx.deps.exchange.placeOrder).not.toHaveBeenCalled();
  });

  it('calls exchange.placeOrder with the order request', async () => {
    await executeOrder(ctx, req, 0);

    expect(ctx.deps.exchange.placeOrder).toHaveBeenCalledWith(req);
  });

  it('increments orderCounter and totalTrades', async () => {
    const { orderCounter } = await executeOrder(ctx, req, 5);

    expect(orderCounter).toBe(6);
    expect(ctx.state.totalTrades).toBe(1);
  });

  it('records lastOrderAt and updatedAt timestamps', async () => {
    const before = Date.now();
    await executeOrder(ctx, req, 0);

    expect(ctx.state.lastOrderAt).toBeGreaterThanOrEqual(before);
    expect(ctx.state.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('calls onTrade with the converted trade object', async () => {
    const result = makeResult();
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(result);

    await executeOrder(ctx, req, 3);

    expect(ctx.onTrade).toHaveBeenCalledTimes(1);
    const trade = (ctx.onTrade as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(trade.id).toBe('trade_bot-1_4');
    expect(trade.exchangeId).toBe(result.exchangeId);
    expect(trade.side).toBe(result.side);
  });

  it('calls killswitch.onOrderFilled with the result', async () => {
    const result = makeResult({ id: 'order-99' });
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(result);

    await executeOrder(ctx, req, 0);

    expect(ctx.deps.killswitch.onOrderFilled).toHaveBeenCalledWith(result);
  });

  it('adds positive pnl to totalPnl and increments winCount', async () => {
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(
      makeResult({ pnl: 120 }),
    );

    await executeOrder(ctx, req, 0);

    expect(ctx.state.totalPnl).toBe(120);
    expect(ctx.state.winCount).toBe(1);
    expect(ctx.state.lossCount).toBe(0);
  });

  it('adds negative pnl to totalPnl and increments lossCount', async () => {
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(
      makeResult({ pnl: -30 }),
    );

    await executeOrder(ctx, req, 0);

    expect(ctx.state.totalPnl).toBe(-30);
    expect(ctx.state.winCount).toBe(0);
    expect(ctx.state.lossCount).toBe(1);
  });

  it('treats zero pnl as a win', async () => {
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(
      makeResult({ pnl: 0 }),
    );

    await executeOrder(ctx, req, 0);

    expect(ctx.state.totalPnl).toBe(0);
    expect(ctx.state.winCount).toBe(1);
    expect(ctx.state.lossCount).toBe(0);
  });

  it('defaults pnl to 0 when result has no pnl', async () => {
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(
      makeResult({ pnl: undefined }),
    );

    await executeOrder(ctx, req, 0);

    expect(ctx.state.totalPnl).toBe(0);
  });

  it('calls killswitch.updateDailyPnl with the pnl', async () => {
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(
      makeResult({ pnl: 75 }),
    );

    await executeOrder(ctx, req, 0);

    expect(ctx.deps.killswitch.updateDailyPnl).toHaveBeenCalledWith(75);
  });

  it('calls killswitch.updatePeakCapital with capital + totalPnl', async () => {
    ctx.state.totalPnl = 50; // simulate prior trades
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(
      makeResult({ pnl: 25 }),
    );

    await executeOrder(ctx, req, 0);

    // capital=1000, totalPnl after this trade = 75
    expect(ctx.deps.killswitch.updatePeakCapital).toHaveBeenCalledWith(1075);
  });

  it('emits telemetry fill event with order details', async () => {
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(
      makeResult({ id: 'ord-42', side: 'sell', price: 61000, quantity: 0.2, pnl: -10 }),
    );

    await executeOrder(ctx, req, 0);

    expect(ctx.emitTelemetry).toHaveBeenCalledWith('fill', {
      orderId: 'ord-42',
      side: 'sell',
      price: 61000,
      quantity: 0.2,
      pnl: -10,
    });
  });

  it('calls emitState after all mutations', async () => {
    await executeOrder(ctx, req, 0);

    expect(ctx.emitState).toHaveBeenCalledTimes(1);
  });

  it('returns the result and incremented counter', async () => {
    const result = makeResult({ id: 'ord-x' });
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(result);

    const { result: returned, orderCounter } = await executeOrder(ctx, req, 10);

    expect(returned).toBe(result);
    expect(orderCounter).toBe(11);
  });

  it('propagates exchange errors', async () => {
    ctx.deps.exchange.placeOrder = vi.fn().mockRejectedValue(
      new Error('Insufficient balance'),
    );

    await expect(executeOrder(ctx, req, 0)).rejects.toThrow(
      'Insufficient balance',
    );
  });

  it('uses the orchestrator result when present and ok', async () => {
    const orchestrated = { ok: true as const, data: makeResult({ id: 'orch-1', price: 99999 }) };
    ctx.deps.exchangeOrchestrator = {
      placeOrder: vi.fn().mockResolvedValue(orchestrated),
    } as never;
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(makeResult({ id: 'unused' }));

    const { result } = await executeOrder(ctx, req, 0);

    expect(ctx.deps.exchangeOrchestrator.placeOrder).toHaveBeenCalledWith('binance', req);
    expect(ctx.deps.exchange.placeOrder).not.toHaveBeenCalled();
    expect(result).toBe(orchestrated.data);
    expect(result.id).toBe('orch-1');
  });

  it('falls back to a rejected order when orchestrator returns !ok', async () => {
    ctx.deps.exchangeOrchestrator = {
      placeOrder: vi.fn().mockResolvedValue({ ok: false as const, error: 'boom' }),
    } as never;

    const { result } = await executeOrder(ctx, req, 0);

    expect(result.status).toBe('rejected');
    expect(result.exchangeId).toBe('binance');
    expect(result.filled).toBe(0);
    expect(result.fee).toBe(0);
    expect(result.price).toBe(60000);
    expect(result.quantity).toBe(0.1);
    expect(ctx.emitTelemetry).toHaveBeenCalledWith('error', {
      error: 'order rejected by orchestrator',
      context: 'bot.executeOrder',
    });
  });

  it('fills rejected fallback with default exchange and price when req omits them', async () => {
    ctx.deps.exchangeOrchestrator = {
      placeOrder: vi.fn().mockResolvedValue({ ok: false as const, error: 'boom' }),
    } as never;
    delete req.exchange;
    delete req.price;

    const { result } = await executeOrder(ctx, req, 0);

    expect(result.status).toBe('rejected');
    expect(result.exchangeId).toBe('paper');
    expect(result.price).toBe(0);
    expect(result.quantity).toBe(0.1);
  });

  it('falls back to deps.exchange when no orchestrator is configured', async () => {
    ctx.deps.exchangeOrchestrator = undefined;
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(makeResult({ id: 'direct' }));

    const { result } = await executeOrder(ctx, req, 0);

    expect(result.id).toBe('direct');
  });

  it('uses paper as default exchange when orchestrator req has no exchange field', async () => {
    const orchestrated = { ok: true as const, data: makeResult({ id: 'orch-default' }) };
    ctx.deps.exchangeOrchestrator = {
      placeOrder: vi.fn().mockResolvedValue(orchestrated),
    } as never;
    delete req.exchange;

    const { result } = await executeOrder(ctx, req, 0);

    expect(ctx.deps.exchangeOrchestrator.placeOrder).toHaveBeenCalledWith('paper', expect.objectContaining({ symbol: 'BTC/USDT' }));
    expect(result.status).toBe('filled');
  });

  it('does not mutate state or call callbacks when exchange throws', async () => {
    ctx.deps.exchange.placeOrder = vi.fn().mockRejectedValue(
      new Error('Network error'),
    );

    try {
      await executeOrder(ctx, req, 0);
    } catch {
      // expected
    }

    expect(ctx.state.totalTrades).toBe(0);
    expect(ctx.onTrade).not.toHaveBeenCalled();
    expect(ctx.emitTelemetry).not.toHaveBeenCalled();
    expect(ctx.emitState).not.toHaveBeenCalled();
  });

  it('accumulates pnl across multiple trades', async () => {
    // Trade 1: +100
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(makeResult({ pnl: 100 }));
    await executeOrder(ctx, req, 0);

    // Trade 2: -30
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(makeResult({ pnl: -30 }));
    await executeOrder(ctx, req, 1);

    expect(ctx.state.totalPnl).toBe(70);
    expect(ctx.state.winCount).toBe(1);
    expect(ctx.state.lossCount).toBe(1);
  });
});
