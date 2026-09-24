// Quantlib strategy function registry
// Maps high-level strategy names to composable trade-signal functions.

import type { QuantFn } from './index';
import { retryWithFallback, gridFunctions } from './functions-grid';
import { meanReversionFunctions, volatilityDcaFunctions } from './functions-mean-reversion';

export { quantFunctions, volatilityDca } from './index';
export type { QuantFn, QuantLibContext, QuantResult } from './index';

export { gridFunctions, meanReversionFunctions, volatilityDcaFunctions };

export const quantFunctionsExt: Record<string, QuantFn> = {
  grid: (ctx, params) => retryWithFallback(gridFunctions, ctx, params),
  mean_reversion: (ctx, params) => retryWithFallback(meanReversionFunctions, ctx, params),
  volatility_dca: (ctx, params) => retryWithFallback(volatilityDcaFunctions, ctx, params),
  fallback: (_ctx) => ({ signal: 'hold', confidence: 0, meta: { reason: 'fallback' } }),
  regular: (ctx, params) => quantFunctionsExt.grid(ctx, params),
};
