// Order execution helper for Volatility DCA strategy.

import type { VolatilityDcaCallbacks } from './volatility-dca-math';

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
