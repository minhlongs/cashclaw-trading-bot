export const OLS_MIN_OBS = 3;
export const DEFAULT_EPSILON = 1e-9;

export interface HedgeRatioEstimate {
  readonly hedgeRatio: number;
  readonly tStat: number;
}

export interface HedgeRatioFailure {
  readonly hedgeRatio: null;
  readonly reason: string;
}

export type HedgeRatioResult = HedgeRatioEstimate | HedgeRatioFailure;

export const HEDGE_RATIO_REASONS = {
  insufficientObservations: 'insufficient observations',
  flatLegA: 'legA close variance is zero in window',
  nonFiniteExposure: 'OLS exposure is non-finite',
  degenerateBeta: 'hedge ratio magnitude below epsilon',
  nonPositiveBeta: 'hedge ratio is non-positive',
} as const;
