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
};