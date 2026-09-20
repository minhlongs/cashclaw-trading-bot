// Mean Reversion Strategy — Order Execution
// Helper functions for entering and exiting long positions.

import type {
  OrderRequest,
} from '../../exchange/types';
import type {
  EnterLongParams,
  ExitLongParams,
} from './mean-reversion-types';

interface EnterLongResult {
  success: boolean;
  position: 'long' | 'none';
  entryPrice: number;
}

interface ExitLongResult {
  success: boolean;
  position: 'long' | 'none';
  entryPrice: number;
}

export async function executeEnterLong(params: EnterLongParams): Promise<EnterLongResult> {
  const { config, callbacks, price, bb, rsi } = params;
  const size = config.capital * (config.positionSizePct / 100);
  const quantity = size / price;

  const req: OrderRequest = {
    symbol: config.symbol,
    exchange: config.exchange,
    side: 'buy',
    type: 'limit',
    price,
    quantity,
    timeInForce: 'GTC',
  };

  try {
    await callbacks.placeOrder(req);
    callbacks.onLog(`LONG entry @ ${price.toFixed(2)} | BB lower=${bb.lower.toFixed(2)} RSI=${rsi.value.toFixed(1)}`);
    return { success: true, position: 'long', entryPrice: price };
  } catch (error) {
    callbacks.onLog(`LONG entry failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return { success: false, position: 'none', entryPrice: 0 };
  }
}

export async function executeExitLong(params: ExitLongParams): Promise<ExitLongResult> {
  const { config, callbacks, entryPrice, price, bb, rsi } = params;
  const quantity = config.capital * (config.positionSizePct / 100) / entryPrice;

  const req: OrderRequest = {
    symbol: config.symbol,
    exchange: config.exchange,
    side: 'sell',
    type: 'limit',
    price,
    quantity,
    timeInForce: 'GTC',
  };

  try {
    await callbacks.placeOrder(req);
    const pnl = ((price - entryPrice) / entryPrice) * 100;
    callbacks.onLog(`LONG exit @ ${price.toFixed(2)} | PnL: ${pnl.toFixed(2)}% | BB upper=${bb.upper.toFixed(2)} RSI=${rsi.value.toFixed(1)}`);
    return { success: true, position: 'none', entryPrice: 0 };
  } catch (error) {
    callbacks.onLog(`LONG exit failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return { success: false, position: 'long', entryPrice };
  }
}
