import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeOrder, type OrderContext } from './bot-order-executor';
import type { OrderRequest, OrderResult } from '../exchange/types';
import type { ExchangeOrchestrator } from '../../land/exchange-orchestration';
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

describe('executeOrder — orchestrator routing & error recovery', () => {
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

  it('propagates exchange errors without mutating state', async () => {
    ctx.deps.exchange.placeOrder = vi.fn().mockRejectedValue(
      new Error('Insufficient balance'),
    );

    await expect(executeOrder(ctx, req, 0)).rejects.toThrow('Insufficient balance');
    expect(ctx.state.totalTrades).toBe(0);
    expect(ctx.onTrade).not.toHaveBeenCalled();
    expect(ctx.emitTelemetry).not.toHaveBeenCalled();
    expect(ctx.emitState).not.toHaveBeenCalled();
  });

  it('uses the orchestrator result when present and ok', async () => {
    const orchestrated = { ok: true as const, data: makeResult({ id: 'orch-1', price: 99999 }) };
    const placeOrder = vi.fn().mockResolvedValue(orchestrated);
    ctx.deps.exchangeOrchestrator = { placeOrder } as unknown as ExchangeOrchestrator;
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(makeResult({ id: 'unused' }));

    const { result } = await executeOrder(ctx, req, 0);

    expect(placeOrder).toHaveBeenCalledWith('binance', req);
    expect(ctx.deps.exchange.placeOrder).not.toHaveBeenCalled();
    expect(result).toBe(orchestrated.data);
    expect(result.id).toBe('orch-1');
  });

  it('falls back to a rejected order when orchestrator returns !ok', async () => {
    ctx.deps.exchangeOrchestrator = {
      placeOrder: vi.fn().mockResolvedValue({ ok: false as const, error: 'boom' }),
    } as unknown as ExchangeOrchestrator;

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
    } as unknown as ExchangeOrchestrator;
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
    const placeOrder = vi.fn().mockResolvedValue(orchestrated);
    ctx.deps.exchangeOrchestrator = { placeOrder } as unknown as ExchangeOrchestrator;
    delete req.exchange;

    const { result } = await executeOrder(ctx, req, 0);

    expect(placeOrder).toHaveBeenCalledWith('paper', expect.objectContaining({ symbol: 'BTC/USDT' }));
    expect(result.status).toBe('filled');
  });

  it('accumulates pnl across multiple trades', async () => {
    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(makeResult({ pnl: 100 }));
    await executeOrder(ctx, req, 0);

    ctx.deps.exchange.placeOrder = vi.fn().mockResolvedValue(makeResult({ pnl: -30 }));
    await executeOrder(ctx, req, 1);

    expect(ctx.state.totalPnl).toBe(70);
    expect(ctx.state.winCount).toBe(1);
    expect(ctx.state.lossCount).toBe(1);
  });
});
