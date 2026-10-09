import { computeFactorExposure } from '@/tree/alpha/factors/analysis';
import type { PairPanel } from './types';
import { OLS_MIN_OBS, DEFAULT_EPSILON, HEDGE_RATIO_REASONS, type HedgeRatioResult } from './hedge-ratio-types';
import { alignedCloses, variance } from './hedge-ratio-helpers';

export * from './hedge-ratio-types';

export function estimateRollingHedgeRatio(
  panel: PairPanel,
  window: number,
  minObs: number,
  asOfTime: number,
  epsilon: number = DEFAULT_EPSILON,
): HedgeRatioResult {
  if (!Number.isInteger(window) || window <= 0) throw new Error('estimateRollingHedgeRatio: window must be a positive integer');
  if (!Number.isInteger(minObs) || minObs <= 0) throw new Error('estimateRollingHedgeRatio: minObs must be a positive integer');
  if (Number.isNaN(asOfTime)) throw new Error('estimateRollingHedgeRatio: asOfTime must not be NaN');
  if (panel.timestamps.length !== panel.closesA.length || panel.timestamps.length !== panel.closesB.length) {
    throw new Error('estimateRollingHedgeRatio: panel array lengths differ');
  }

  const { a, b } = alignedCloses(panel, window, asOfTime);
  const required = Math.max(minObs, OLS_MIN_OBS);
  if (a.length < required) return { hedgeRatio: null, reason: HEDGE_RATIO_REASONS.insufficientObservations };
  if (variance(a) === 0) return { hedgeRatio: null, reason: HEDGE_RATIO_REASONS.flatLegA };

  const exposure = computeFactorExposure(b, a, 'hedge');
  const beta = exposure.exposure;
  if (!Number.isFinite(beta)) return { hedgeRatio: null, reason: HEDGE_RATIO_REASONS.nonFiniteExposure };
  if (Math.abs(beta) < epsilon) return { hedgeRatio: null, reason: HEDGE_RATIO_REASONS.degenerateBeta };
  if (beta <= 0) return { hedgeRatio: null, reason: HEDGE_RATIO_REASONS.nonPositiveBeta };
  return { hedgeRatio: beta, tStat: exposure.tStat };
}
