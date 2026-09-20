// QuantLib registry entry point — real quantitative signal implementations.

import { volatilityDca } from './volatility-dca';
import { grid, meanReversion } from './strategies';

export { volatilityDca } from './volatility-dca';
export { grid, meanReversion } from './strategies';

export interface QuantLibContext {
  symbol: string;
  balance: number;
  lastPrice: number;
}

export interface QuantResult {
  signal: 'buy' | 'sell' | 'hold';
  confidence: number;
  meta: Record<string, unknown>;
}

export type QuantFn = (ctx: QuantLibContext, params?: Record<string, number>) => QuantResult;

export const quantFunctions: Record<string, QuantFn> = {
  noop: () => ({ signal: 'hold', confidence: 0, meta: {} }),
  grid,
  mean_reversion: meanReversion,
  volatility_dca: volatilityDca,
};
