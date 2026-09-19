// Volatility math helpers for the Volatility-Adjusted DCA strategy.

import type { OrderRequest, OrderResult } from '../../exchange/types';
import type { BotTrade } from '../types';

export interface VolatilityDcaCallbacks {
  placeOrder?: (req: OrderRequest) => Promise<OrderResult>;
  onTrade?: (trade: BotTrade) => void;
  onLog: (msg: string) => void;
}

/** Realized annualized volatility from a price window (std dev of log returns × √252 × 100). */
export function computeAnnualizedVol(prices: number[]): number {
  if (prices.length < 2) return 0;
  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    logReturns.push(Math.log(prices[i]! / prices[i - 1]!));
  }
  const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
  const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / logReturns.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}
