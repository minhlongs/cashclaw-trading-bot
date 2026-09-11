// QuantLib registry entry point — real quantitative signal implementations.

import { volatilityDca } from './volatility-dca';

export { volatilityDca } from './volatility-dca';

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

/**
 * Grid strategy: generates buy/sell signals when price approaches a grid level.
 *
 * params:
 *   gridSpacing   — fractional gap between grid levels (default 0.02 = 2%)
 *   levels        — number of grid levels above and below anchor (default 5)
 *   tolerance     — fractional distance-to-level that triggers a signal (default 0.005 = 0.5%)
 *   anchor        — reference price for grid construction (default: lastPrice at call time)
 */
function grid(ctx: QuantLibContext, params?: Record<string, number>): QuantResult {
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

  // Build grid levels symmetrically around anchor.
  const lowerLevels: number[] = [];
  const upperLevels: number[] = [];
  for (let i = 1; i <= levels; i++) {
    lowerLevels.push(anchor * (1 - spacing * i));
    upperLevels.push(anchor * (1 + spacing * i));
  }

  const price = ctx.lastPrice;

  // Find the nearest lower level — buy signal when price is within tolerance of it.
  const nearestLower = lowerLevels.reduce(
    (best, lv) => (Math.abs(price - lv) < Math.abs(price - best) ? lv : best),
    lowerLevels[0],
  );

  // Find the nearest upper level — sell signal when price is within tolerance of it.
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
}

/**
 * Mean-reversion strategy: generates buy/sell signals based on deviation from fair value.
 *
 * params:
 *   fairValue  — reference price (required for a non-hold signal; defaults to lastPrice → hold)
 *   threshold  — fractional deviation that triggers a signal (default 0.015 = 1.5%)
 *   maxConf    — maximum confidence emitted at 2× threshold deviation (default 0.8)
 */
function meanReversion(ctx: QuantLibContext, params?: Record<string, number>): QuantResult {
  if (ctx.lastPrice <= 0) {
    return { signal: 'hold', confidence: 0, meta: { strategy: 'mean_reversion' } };
  }

  const fairValue = params?.fairValue;
  const threshold = params?.threshold ?? 0.015;
  const maxConf = params?.maxConf ?? 0.8;

  if (fairValue === undefined || fairValue <= 0) {
    // No reference price available — conservative hold.
    return { signal: 'hold', confidence: 0, meta: { strategy: 'mean_reversion', reason: 'no_fair_value' } };
  }

  if (threshold <= 0) {
    return { signal: 'hold', confidence: 0, meta: { strategy: 'mean_reversion', reason: 'invalid_threshold' } };
  }

  const deviation = (ctx.lastPrice - fairValue) / fairValue;

  if (deviation <= -threshold) {
    // Price below fair value — buy opportunity.
    const strength = Math.min(1, Math.abs(deviation) / (2 * threshold));
    const confidence = parseFloat((strength * maxConf).toFixed(4));
    return {
      signal: 'buy',
      confidence,
      meta: { strategy: 'mean_reversion', fairValue, deviation: parseFloat(deviation.toFixed(6)) },
    };
  }

  if (deviation >= threshold) {
    // Price above fair value — sell opportunity.
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
}

export const quantFunctions: Record<string, QuantFn> = {
  noop: () => ({ signal: 'hold', confidence: 0, meta: {} }),
  grid,
  mean_reversion: meanReversion,
  volatility_dca: volatilityDca,
};
