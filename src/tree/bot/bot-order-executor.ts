// Bot Order Executor — standalone order execution + trade recording
// Functions extracted from BotInstance for size compliance.

import type {
  OrderRequest,
  OrderResult,
} from '../exchange/types';
import type {
  BotTrade,
  BotDependencies,
  BotState,
} from './types';
import type { TradeEventType } from '../telemetry/types';

export interface OrderContext {
  deps: BotDependencies;
  config: { capital: number; symbol: string };
  state: BotState;
  botId: string;
  onTrade: (trade: BotTrade) => void;
  emitTelemetry: (eventType: TradeEventType, details: Record<string, unknown>) => void;
  emitState: () => void;
}

/**
 * Execute an order against the exchange and update bot state.
 * Returns the result and the incremented order counter.
 */
export async function executeOrder(
  ctx: OrderContext,
  req: OrderRequest,
  orderCounter: number,
): Promise<{ result: OrderResult; orderCounter: number }> {
  const { deps, config, state, botId, onTrade, emitTelemetry, emitState } = ctx;

  if (!deps.killswitch.isTradingEnabled()) {
    throw new Error('Trading halted by killswitch');
  }

  const result = await deps.exchange.placeOrder(req);
  state.lastOrderAt = Date.now();
  orderCounter++;
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

  emitTelemetry('fill', {
    orderId: result.id,
    side: result.side,
    price: result.price,
    quantity: result.quantity,
    pnl,
  });

  state.updatedAt = Date.now();
  emitState();

  return { result, orderCounter };
}

/**
 * Convert an OrderResult into a BotTrade record.
 * orderCounter must be incremented before calling (it is embedded in the trade ID).
 */
export function orderResultToTrade(
  result: OrderResult,
  botId: string,
  orderCounter: number,
): BotTrade {
  return {
    id: `trade_${botId}_${orderCounter}`,
    botId,
    exchangeId: result.exchangeId,
    symbol: result.symbol,
    side: result.side,
    type: result.type,
    price: result.price,
    quantity: result.quantity,
    filled: result.filled,
    fee: result.fee ?? 0,
    pnl: result.pnl ?? 0,
    status: result.status as BotTrade['status'],
    timestamp: result.timestamp,
  };
}
