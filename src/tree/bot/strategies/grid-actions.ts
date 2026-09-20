// Grid Trading Strategy — Level Actions
// Helper routines for filling and closing grid levels.

import type {
  GridBotConfig,
  GridLevel,
  BotTrade,
} from '../types';
import type {
  OrderRequest,
  OrderResult,
} from '../../exchange/types';

export interface GridStrategyCallbacks {
  placeOrder: (req: OrderRequest) => Promise<OrderResult>;
  onTrade: (trade: BotTrade) => void;
  onLog: (msg: string) => void;
}

export interface FillLevelParams {
  config: GridBotConfig;
  callbacks: GridStrategyCallbacks;
  level: GridLevel;
  fillPrice: number;
}

export type CloseReason = 'take-profit' | 'stop-loss';

export interface CloseLevelParams {
  callbacks: GridStrategyCallbacks;
  level: GridLevel;
  closePrice: number;
  reason: CloseReason;
}

export async function executeFillLevel(params: FillLevelParams): Promise<GridLevel> {
  const { config, callbacks, level, fillPrice } = params;

  level.status = 'filled';
  level.price = fillPrice;
  level.filledPrice = fillPrice;

  try {
    const req: OrderRequest = {
      symbol: config.symbol,
      exchange: config.exchange,
      side: level.side,
      type: 'limit',
      price: fillPrice,
      quantity: level.quantity,
      timeInForce: 'GTC',
    };
    const order = await callbacks.placeOrder(req);
    level.orderId = order.id;
    callbacks.onLog(`Level ${level.level} ${level.side} filled @ ${fillPrice.toFixed(2)}`);
  } catch (error) {
    level.status = 'pending';
    callbacks.onLog(`Level ${level.level} ${level.side} failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }

  return level;
}

export function formatCloseLevel(params: CloseLevelParams): GridLevel {
  const { callbacks, level, closePrice, reason } = params;

  level.status = 'cancelled';
  level.price = closePrice;
  callbacks.onLog(`Level ${level.level} ${level.side} closed @ ${closePrice.toFixed(2)} (${reason})`);

  return level;
}
