import type { OrderRequest, OrderResult } from '../exchange/types';
import { type OrderContext, orderResultToTrade } from './bot-order-executor-types';
import { dispatchExchangeOrder } from './bot-order-executor-dispatch';
import { isPositionReducingOrder } from './bot-ledger-hydration';
import {
  ensureDurableBotHydrated,
  releaseLifecycleOnDispatchThrow,
  settleLifecyclePostDispatch,
  submitLifecyclePreDispatch,
} from './bot-order-lifecycle-bridge';

export type { OrderContext };
export { orderResultToTrade };

function evaluatePreTradeProtection(
  ctx: OrderContext, req: OrderRequest, orderCounter: number, reduceOnly: boolean,
): number {
  const { deps, botId, emitTelemetry } = ctx;
  if (!deps.protectionEngine || !deps.protectionContextProvider) {
    return req.price ?? 0;
  }

  const tickCtx = deps.protectionContextProvider({ symbol: req.symbol, price: req.price });
  const candidatePrice = req.price ?? tickCtx.markets[req.symbol]?.midPrice ?? 0;
  const gateDecision = deps.protectionEngine.evaluatePreTrade(
    {
      orderId: `pre_${botId}_${orderCounter + 1}`,
      botId,
      strategyId: botId,
      symbol: req.symbol,
      side: req.side === 'buy' ? 'BUY' : 'SELL',
      orderType: req.type === 'market' ? 'MARKET' : 'LIMIT',
      price: candidatePrice,
      quantity: req.quantity,
      reduceOnly,
      timestampMs: tickCtx.nowMs,
    },
    tickCtx,
  );

  if (!gateDecision.allowed) {
    emitTelemetry('error', {
      error: gateDecision.reason,
      action: gateDecision.action,
      posture: gateDecision.posture,
      context: 'bot.protectionEngine',
    });
    throw new Error(`Order blocked by CapitalProtectionEngine (${gateDecision.action}): ${gateDecision.reason}`);
  }
  return candidatePrice;
}

export async function executeOrder(
  ctx: OrderContext,
  req: OrderRequest,
  orderCounter: number,
): Promise<{ result: OrderResult; orderCounter: number }> {
  const { deps, config, state, botId, onTrade, emitTelemetry, emitState } = ctx;
  if (deps.killswitch && !deps.killswitch.isTradingEnabled()) {
    emitTelemetry('error', { error: 'Trading halted by killswitch', context: 'bot.executeOrder' });
    throw new Error('Trading halted by killswitch');
  }

  await ensureDurableBotHydrated(ctx);
  const nextCounter = orderCounter + 1;
  const reduceOnly = isPositionReducingOrder(ctx, req);
  const effectivePrice = evaluatePreTradeProtection(ctx, req, nextCounter - 1, reduceOnly);
  const submittedOrder = deps.lifecycleEngine
    ? await submitLifecyclePreDispatch(ctx, deps.lifecycleEngine, req, nextCounter - 1, effectivePrice, reduceOnly)
    : undefined;

  let result: OrderResult;
  try {
    result = await dispatchExchangeOrder(ctx, req);
  } catch (dispatchError) {
    if (deps.lifecycleEngine && submittedOrder) {
      await releaseLifecycleOnDispatchThrow(ctx, deps.lifecycleEngine, submittedOrder.clientOrderId);
    }
    throw dispatchError;
  }

  if (deps.lifecycleEngine && submittedOrder) {
    await settleLifecyclePostDispatch(ctx, deps.lifecycleEngine, submittedOrder, effectivePrice, result);
  }

  state.lastOrderAt = Date.now();
  orderCounter = nextCounter;
  state.totalTrades++;

  const trade = orderResultToTrade(result, botId, orderCounter);
  onTrade(trade);
  deps.killswitch.onOrderFilled(result);

  const pnl = result.pnl ?? 0;
  state.totalPnl += pnl;
  if (pnl >= 0) state.winCount++;
  else state.lossCount++;

  deps.killswitch.updateDailyPnl(pnl);
  deps.killswitch.updatePeakCapital(config.capital + state.totalPnl);
  emitTelemetry('fill', { orderId: result.id, side: result.side, price: result.price, quantity: result.quantity, pnl });

  state.updatedAt = Date.now();
  emitState();
  return { result, orderCounter };
}
