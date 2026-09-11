// Volatility-Adjusted Dollar-Cost Averaging (DCA) Strategy
// Dynamically adjusts required step drops based on market volatility relative to baseline.

import type { QuantLibContext, QuantResult } from './index';

interface ResolvedDcaParams {
  volatility: number;
  volBaseline: number;
  priceDropStep: number;
  stepIndex: number;
  maxSteps: number;
  reboundTarget: number;
}

function resolveDcaParams(params?: Record<string, number>): ResolvedDcaParams {
  return {
    volatility: params?.volatility ?? 0.02,
    volBaseline: params?.volBaseline ?? 0.02,
    priceDropStep: params?.priceDropStep ?? 0.025,
    stepIndex: Math.floor(params?.stepIndex ?? 0),
    maxSteps: Math.floor(params?.maxSteps ?? 5),
    reboundTarget: params?.reboundTarget ?? 0.04,
  };
}

function hasInvalidNumericParam(ref: number, step: number, max: number, baseline: number): boolean {
  return ref <= 0 || step <= 0 || max <= 0 || baseline <= 0;
}

/**
 * Volatility-Adjusted Dollar-Cost Averaging strategy.
 *
 * params:
 *   referencePrice — entry / anchor price for computing drawdown (required)
 *   volatility     — current market volatility (default 0.02 = 2%)
 *   volBaseline    — benchmark / normal volatility (default 0.02 = 2%)
 *   priceDropStep  — base drop percentage per DCA step (default 0.025 = 2.5%)
 *   stepIndex      — current DCA step index reached, 0-based (default 0)
 *   maxSteps       — maximum allowed DCA steps (default 5)
 *   reboundTarget  — profit harvest threshold above reference price (default 0.04 = 4%)
 */
export function volatilityDca(ctx: QuantLibContext, params?: Record<string, number>): QuantResult {
  if (ctx.lastPrice <= 0) {
    return { signal: 'hold', confidence: 0, meta: { strategy: 'volatility_dca', reason: 'invalid_price' } };
  }

  const referencePrice = params?.referencePrice;
  if (referencePrice === undefined) {
    return { signal: 'hold', confidence: 0, meta: { strategy: 'volatility_dca', reason: 'no_reference_price' } };
  }

  const p = resolveDcaParams(params);

  if (hasInvalidNumericParam(referencePrice, p.priceDropStep, p.maxSteps, p.volBaseline)) {
    return { signal: 'hold', confidence: 0, meta: { strategy: 'volatility_dca', reason: 'invalid_params' } };
  }

  if (p.stepIndex >= p.maxSteps) {
    return { signal: 'hold', confidence: 0, meta: { strategy: 'volatility_dca', reason: 'max_steps_reached' } };
  }

  const drop = (referencePrice - ctx.lastPrice) / referencePrice;
  const volMultiplier = Math.max(0.5, Math.min(2.5, p.volatility / p.volBaseline));
  const requiredDrop = p.priceDropStep * (p.stepIndex + 1) * volMultiplier;

  if (drop >= requiredDrop) {
    const rawConf = Math.min(1, Math.max(0.1, drop / (requiredDrop * 1.5)));
    return {
      signal: 'buy',
      confidence: parseFloat(rawConf.toFixed(4)),
      meta: {
        strategy: 'volatility_dca',
        step: p.stepIndex + 1,
        drop: parseFloat(drop.toFixed(6)),
        requiredDrop: parseFloat(requiredDrop.toFixed(6)),
        volMultiplier: parseFloat(volMultiplier.toFixed(4)),
      },
    };
  }

  if (drop <= -p.reboundTarget) {
    const rawConf = Math.min(1, Math.abs(drop) / (2 * p.reboundTarget));
    return {
      signal: 'sell',
      confidence: parseFloat(rawConf.toFixed(4)),
      meta: {
        strategy: 'volatility_dca',
        profitRatio: parseFloat((-drop).toFixed(6)),
      },
    };
  }

  return {
    signal: 'hold',
    confidence: 0,
    meta: {
      strategy: 'volatility_dca',
      drop: parseFloat(drop.toFixed(6)),
      requiredDrop: parseFloat(requiredDrop.toFixed(6)),
    },
  };
}
