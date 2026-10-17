import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  orderResultToTrade,
  executeOrder,
  type OrderContext,
} from './bot-order-executor';
import type { OrderRequest, OrderResult } from '../exchange/types';
import type { BotState } from './types';

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

  it('defaults fee and pnl to 0 when not provided', () => {
    const noFee = makeResult({ fee: undefined, pnl: undefined });
    const t = orderResultToTrade(noFee, 'b', 1);
    expect(t.fee).toBe(0);
    expect(t.pnl).toBe(0);
  });

  it('preserves fee, pnl and status when present', () => {
    expect(trade.fee).toBe(3);
    expect(trade.pnl).toBe(50);
    expect(trade.status).toBe('filled');
  });

  it('different counters produce different IDs', () => {
    const t1 = orderResultToTrade(result, 'b', 1);
    const t2 = orderResultToTrade(result, 'b', 2);
    expect(t1.id).not.toBe(t2.id);
  });
});

describe('executeOrder — core execution & state mutations', () => {
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

  it('throws and does not call exchange when killswitch halts trading', async () => {
    ctx.deps.killswitch.isTradingEnabled = vi.fn().mockReturnValue(false);
    await expect(executeOrder(ctx, req, 0)).rejects.toThrow('Trading halted by killswitch');
    expect(ctx.deps.exchange.placeOrder).not.toHaveBeenCalled();
  });

  it('calls exchange.placeOrder and increments orderCounter and totalTrades', async () => {
    const before = Date.now();
    const { orderCounter } = await executeOrder(ctx, req, 5);
    expect(ctx.deps.exchange.placeOrder).toHaveBeenCalledWith(req);
    expect(orderCounter).toBe(6);
    expect(ctx.state.totalTrades).toBe(1);
    expect(ctx.state.lastOrderAt).toBeGreaterThanOrEqual(before);
    expect(ctx.state.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('calls onTrade and killswitch.onOrderFilled with the converted result', async () => {
    const result = makeResult({ id: 'order-99' });
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(result);

    await executeOrder(ctx, req, 3);

    expect(ctx.onTrade).toHaveBeenCalledTimes(1);
    const trade = (ctx.onTrade as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(trade.id).toBe('trade_bot-1_4');
    expect(ctx.deps.killswitch.onOrderFilled).toHaveBeenCalledWith(result);
  });

  it('adds positive pnl to totalPnl and increments winCount', async () => {
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(makeResult({ pnl: 120 }));
    await executeOrder(ctx, req, 0);
    expect(ctx.state.totalPnl).toBe(120);
    expect(ctx.state.winCount).toBe(1);
    expect(ctx.state.lossCount).toBe(0);
  });

  it('adds negative pnl to totalPnl and increments lossCount', async () => {
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(makeResult({ pnl: -30 }));
    await executeOrder(ctx, req, 0);
    expect(ctx.state.totalPnl).toBe(-30);
    expect(ctx.state.winCount).toBe(0);
    expect(ctx.state.lossCount).toBe(1);
  });

  it('treats zero or undefined pnl as a win with 0 pnl', async () => {
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(makeResult({ pnl: undefined }));
    await executeOrder(ctx, req, 0);
    expect(ctx.state.totalPnl).toBe(0);
    expect(ctx.state.winCount).toBe(1);
    expect(ctx.state.lossCount).toBe(0);
  });

  it('updates killswitch dailyPnl, peakCapital, telemetry and state', async () => {
    ctx.state.totalPnl = 50;
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(
      makeResult({ id: 'ord-42', side: 'sell', price: 61000, quantity: 0.2, pnl: 25 }),
    );

    const { orderCounter } = await executeOrder(ctx, req, 10);

    expect(ctx.deps.killswitch.updateDailyPnl).toHaveBeenCalledWith(25);
    expect(ctx.deps.killswitch.updatePeakCapital).toHaveBeenCalledWith(1075);
    expect(ctx.emitTelemetry).toHaveBeenCalledWith('fill', {
      orderId: 'ord-42',
      side: 'sell',
      price: 61000,
      quantity: 0.2,
      pnl: 25,
    });
    expect(ctx.emitState).toHaveBeenCalledTimes(1);
    expect(orderCounter).toBe(11);
  });
});
