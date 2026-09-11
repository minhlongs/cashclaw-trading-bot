// Quantlib strategy function registry
// Maps high-level strategy names to composable trade-signal functions.

import type { QuantFn, QuantLibContext, QuantResult } from './index';
import { volatilityDca } from './volatility-dca';

export { quantFunctions, volatilityDca } from './index';
export type { QuantFn, QuantLibContext, QuantResult } from './index';

function retryWithFallback(fns: QuantFn[], ctx: QuantLibContext, params?: Record<string, number>): QuantResult {
  for (const fn of fns) {
    try {
      return fn(ctx, params);
    } catch {
      // continue to next fallback
    }
  }
  return { signal: 'hold', confidence: 0, meta: { error: 'all_fallbacks_failed' } };
}

export const gridFunctions: QuantFn[] = [
  (ctx: QuantLibContext, params?: Record<string, number>): QuantResult => {
    if (ctx.lastPrice <= 0) {
      return { signal: 'hold', confidence: 0, meta: { strategy: 'grid', reason: 'invalid_price' } };
    }
    const spacing = params?.gridSpacing ?? 0.02;
    const levels = Math.floor(params?.levels ?? 5);
    const tolerance = params?.tolerance ?? 0.005;
    const anchor = params?.anchor ?? ctx.lastPrice;

    if (spacing <= 0 || levels <= 0 || tolerance <= 0) {
      return { signal: 'hold', confidence: 0, meta: { strategy: 'grid', reason: 'invalid_params' } };
    }

    const lowerLevels: number[] = [];
    const upperLevels: number[] = [];
    for (let i = 1; i <= levels; i++) {
      lowerLevels.push(anchor * (1 - spacing * i));
      upperLevels.push(anchor * (1 + spacing * i));
    }

    const price = ctx.lastPrice;
    const nearestLower = lowerLevels.reduce(
      (best, lv) => (Math.abs(price - lv) < Math.abs(price - best) ? lv : best),
      lowerLevels[0],
    );
    const nearestUpper = upperLevels.reduce(
      (best, lv) => (Math.abs(price - lv) < Math.abs(price - best) ? lv : best),
      upperLevels[0],
    );

    const distToLower = Math.abs(price - nearestLower) / price;
    const distToUpper = Math.abs(price - nearestUpper) / price;

    if (distToLower <= tolerance && distToLower <= distToUpper) {
      const confidence = Math.max(0, Math.min(1, 1 - distToLower / tolerance));
      return {
        signal: 'buy',
        confidence: parseFloat(confidence.toFixed(4)),
        meta: { strategy: 'grid', nearestLevel: nearestLower, distanceFraction: distToLower },
      };
    }

    if (distToUpper <= tolerance) {
      const confidence = Math.max(0, Math.min(1, 1 - distToUpper / tolerance));
      return {
        signal: 'sell',
        confidence: parseFloat(confidence.toFixed(4)),
        meta: { strategy: 'grid', nearestLevel: nearestUpper, distanceFraction: distToUpper },
      };
    }

    return {
      signal: 'hold',
      confidence: 0,
      meta: { strategy: 'grid', nearestLower, nearestUpper },
    };
  },
];

export const meanReversionFunctions: QuantFn[] = [
  (ctx: QuantLibContext, params?: Record<string, number>): QuantResult => {
    if (ctx.lastPrice <= 0) {
      return { signal: 'hold', confidence: 0, meta: { strategy: 'mean_reversion' } };
    }
    const fairValue = params?.fairValue;
    const threshold = params?.threshold ?? 0.015;
    const maxConf = params?.maxConf ?? 0.8;

    if (fairValue === undefined || fairValue <= 0) {
      return { signal: 'hold', confidence: 0, meta: { strategy: 'mean_reversion', reason: 'no_fair_value' } };
    }

    if (threshold <= 0) {
      return { signal: 'hold', confidence: 0, meta: { strategy: 'mean_reversion', reason: 'invalid_threshold' } };
    }

    const deviation = (ctx.lastPrice - fairValue) / fairValue;

    if (deviation <= -threshold) {
      const strength = Math.min(1, Math.abs(deviation) / (2 * threshold));
      const confidence = parseFloat((strength * maxConf).toFixed(4));
      return {
        signal: 'buy',
        confidence,
        meta: { strategy: 'mean_reversion', fairValue, deviation: parseFloat(deviation.toFixed(6)) },
      };
    }

    if (deviation >= threshold) {
      const strength = Math.min(1, deviation / (2 * threshold));
      const confidence = parseFloat((strength * maxConf).toFixed(4));
      return {
        signal: 'sell',
        confidence,
        meta: { strategy: 'mean_reversion', fairValue, deviation: parseFloat(deviation.toFixed(6)) },
      };
    }

    return {
      signal: 'hold',
      confidence: 0,
      meta: { strategy: 'mean_reversion', fairValue, deviation: parseFloat(deviation.toFixed(6)) },
    };
  },
];

export const volatilityDcaFunctions: QuantFn[] = [volatilityDca];

export const quantFunctionsExt: Record<string, QuantFn> = {
  grid: (ctx, params) => retryWithFallback(gridFunctions, ctx, params),
  mean_reversion: (ctx, params) => retryWithFallback(meanReversionFunctions, ctx, params),
  volatility_dca: (ctx, params) => retryWithFallback(volatilityDcaFunctions, ctx, params),
  fallback: (_ctx) => ({ signal: 'hold', confidence: 0, meta: { reason: 'fallback' } }),
  regular: (ctx, params) => quantFunctionsExt.grid(ctx, params),
};
