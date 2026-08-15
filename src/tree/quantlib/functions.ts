// Quantlib strategy function registry
// Maps high-level strategy names to composable trade-signal functions.
// Phase 01: minimal wrappers around existing grid/mean-reversion strategies.

import type { QuantFn, QuantLibContext, QuantResult } from './index';

export { quantFunctions } from './index';
export type { QuantFn, QuantLibContext, QuantResult } from './index';

function retryWithFallback(fns: QuantFn[], ctx: QuantLibContext): QuantResult {
  for (const fn of fns) {
    try {
      return fn(ctx);
    } catch {
      // continue to next fallback
    }
  }
  return { signal: 'hold', confidence: 0, meta: { error: 'all_fallbacks_failed' } };
}

export const gridFunctions: QuantFn[] = [
  (ctx: QuantLibContext): QuantResult => ({
    signal: 'buy',
    confidence: 0.5,
    meta: { strategy: 'grid', symbol: ctx.symbol },
  }),
];

export const meanReversionFunctions: QuantFn[] = [
  (ctx: QuantLibContext): QuantResult => {
    if (ctx.lastPrice <= 0) return { signal: 'hold', confidence: 0, meta: {} };
    return { signal: 'hold', confidence: 0.3, meta: { strategy: 'mean_reversion', symbol: ctx.symbol } };
  },
];

export const quantFunctionsExt: Record<string, QuantFn> = {
  grid: (ctx) => retryWithFallback(gridFunctions, ctx),
  mean_reversion: (ctx) => retryWithFallback(meanReversionFunctions, ctx),
  fallback: (_ctx) => ({ signal: 'hold', confidence: 0, meta: { reason: 'fallback' } }),
  regular: (ctx) => quantFunctionsExt.grid(ctx),
};