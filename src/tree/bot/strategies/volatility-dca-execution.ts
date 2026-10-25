// Order execution helper for Volatility DCA strategy.

import type { VolatilityDcaCallbacks } from './volatility-dca-math';
import {
  computeQuantExecutionPlan,
  type QuantExecutionInput,
  type QuantExecutionPlan,
} from './quantlib-execution-sizer';

export async function executeDcaOrder(
  callbacks: VolatilityDcaCallbacks,
  symbol: string,
  exchange: string,
  side: 'buy' | 'sell',
  price: number,
  quantity: number,
): Promise<void> {
  if (!callbacks.placeOrder) return;
  try {
    await callbacks.placeOrder({
      symbol,
      exchange,
      side,
      type: 'limit',
      price,
      quantity,
      timeInForce: 'GTC',
    });
  } catch (error) {
    callbacks.onLog(
      `VolatilityDCA ${side} order failed: ${error instanceof Error ? error.message : 'unknown'}`,
    );
  }
}

export async function executeQuantDcaOrder(
  callbacks: VolatilityDcaCallbacks,
  symbol: string,
  exchange: string,
  side: 'buy' | 'sell',
  price: number,
  quantity: number,
  quantInput: Omit<QuantExecutionInput, 'totalQuantity'>,
): Promise<QuantExecutionPlan> {
  const plan = computeQuantExecutionPlan({ totalQuantity: quantity, ...quantInput });
  callbacks.onLog(
    `VolatilityDCA quant execution: class=${plan.strategyClass} slice=${plan.sliceQuantity} throttled=${plan.isThrottled}`,
  );
  await executeDcaOrder(callbacks, symbol, exchange, side, price, plan.sliceQuantity);
  return plan;
}
