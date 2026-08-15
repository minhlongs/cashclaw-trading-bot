// QuantLib registry entry point — minimal v1 stub.
// TODO: expand with real implementations from Vibe-Trading quantlib.

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
  grid: () => ({ signal: 'hold', confidence: 0.35, meta: { strategy: 'grid' } }),
  mean_reversion: (ctx) =>
    ctx.lastPrice > 0 ? ({ signal: 'hold', confidence: 0.3, meta: { strategy: 'mean_reversion' } }) : ({ signal: 'hold', confidence: 0, meta: {} }),
};