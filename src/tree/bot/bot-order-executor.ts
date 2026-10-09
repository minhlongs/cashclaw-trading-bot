import type { OrderRequest, OrderResult } from '../exchange/types';
import { type OrderContext, orderResultToTrade } from './bot-order-executor-types';
import { dispatchExchangeOrder } from './bot-order-executor-dispatch';

export type { OrderContext };
export { orderResultToTrade };

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

  const result = await dispatchExchangeOrder(ctx, req);
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
  emitTelemetry('fill', { orderId: result.id, side: result.side, price: result.price, quantity: result.quantity, pnl });

  state.updatedAt = Date.now();
  emitState();
  return { result, orderCounter };
}
