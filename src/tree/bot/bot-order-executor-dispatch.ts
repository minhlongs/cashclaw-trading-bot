import type { OrderRequest, OrderResult } from '../exchange/types';
import type { OrderContext } from './bot-order-executor-types';

export async function dispatchExchangeOrder(ctx: OrderContext, req: OrderRequest): Promise<OrderResult> {
  const { deps, emitTelemetry } = ctx;
  if (!deps.exchangeOrchestrator) return deps.exchange.placeOrder(req);

  const orchestrated = await deps.exchangeOrchestrator.placeOrder(req.exchange ?? 'paper', req);
  if (orchestrated.ok) return orchestrated.data;

  emitTelemetry('error', { error: 'order rejected by orchestrator', context: 'bot.executeOrder' });
  return {
    id: `rejected-${Date.now()}`,
    exchangeId: req.exchange ?? 'paper',
    symbol: req.symbol,
    side: req.side,
    type: req.type,
    price: req.price ?? 0,
    quantity: req.quantity,
    filled: 0,
    fee: 0,
    pnl: 0,
    status: 'rejected',
    timestamp: Date.now(),
  };
}
