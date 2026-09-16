// Beta-aware weight scaling for cross-sectional portfolios.
// Orchestrates beta estimation (from ./beta-estimation) with basket
// neutralization to scale portfolio weights to a target beta.

import { basketNeutralize } from '@/tree/alpha/universe/universe';

import {
  estimateRollingBetas,
  type BetaScaleConfig,
  type BetaScaleResult,
} from './beta-estimation';

export { estimateRollingBetas };
export type { BetaScaleConfig, BetaScaleResult };

const DEFAULT_EPSILON = 1e-9;

/**
 * Scale weights to a target portfolio beta βp = Σ w_i·β_i.
 * - targetBeta === 0: neutralize via basketNeutralize (division by βp is
 *   degenerate at zero); betaApplied = 'neutralized'.
 * - targetBeta ≠ 0: fail-closed (input weights unchanged, betaApplied false)
 *   when any held asset has a null/missing beta or |βp| < epsilon. Otherwise
 *   w_i ← w_i × (targetBeta / βp).
 */
export function scaleWeightsToTargetBeta(
  weights: Readonly<Record<string, number>>,
  betas: Readonly<Record<string, number | null>>,
  targetBeta: number,
  config: BetaScaleConfig = {},
): BetaScaleResult {
  if (Number.isNaN(targetBeta)) {
    throw new Error('scaleWeightsToTargetBeta: targetBeta must not be NaN');
  }
  if (targetBeta === 0) {
    return { weights: basketNeutralize({ ...weights }), betaApplied: 'neutralized' };
  }

  const held = Object.entries(weights).filter(([, w]) => w !== 0);
  if (held.length === 0) {
    return {
      weights: { ...weights },
      betaApplied: false,
      fallbackReason: 'no held positions to size',
    };
  }

  const resolved: Array<{ symbol: string; weight: number; beta: number }> = [];
  for (const [symbol, weight] of held) {
    const beta = betas[symbol];
    if (beta === null || beta === undefined) {
      return {
        weights: { ...weights },
        betaApplied: false,
        fallbackReason: `missing beta estimate for held asset ${symbol}`,
      };
    }
    resolved.push({ symbol, weight, beta });
  }

  const portfolioBeta = resolved.reduce((s, r) => s + r.weight * r.beta, 0);
  const epsilon = config.epsilon ?? DEFAULT_EPSILON;
  if (Math.abs(portfolioBeta) < epsilon) {
    return {
      weights: { ...weights },
      betaApplied: false,
      fallbackReason: `portfolio beta ${portfolioBeta} within epsilon of zero`,
    };
  }

  const scale = targetBeta / portfolioBeta;
  let grossIn = 0;
  const scaled: Record<string, number> = {};
  for (const [symbol, w] of Object.entries(weights)) {
    grossIn += Math.abs(w);
    scaled[symbol] = w * scale;
  }
  if (config.renormalize === true && grossIn > 0) {
    const grossOut = Object.values(scaled).reduce((s, w) => s + Math.abs(w), 0);
    const fix = grossIn / grossOut;
    for (const symbol of Object.keys(scaled)) scaled[symbol]! *= fix;
  }
  return { weights: scaled, betaApplied: true };
}
