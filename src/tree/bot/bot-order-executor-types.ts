import type { OrderResult } from '../exchange/types';
import type { BotTrade, BotDependencies, BotState } from './types';
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

export function orderResultToTrade(result: OrderResult, botId: string, orderCounter: number): BotTrade {
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
