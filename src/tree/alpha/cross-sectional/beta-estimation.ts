import { computeFactorExposure } from '@/tree/alpha/factors/analysis';
import type { AssetReturnSeries } from './types';
import { requirePositiveInteger, requireAlignedSeries, alignedPairs, variance } from './beta-estimation-pairs';

const OLS_MIN_OBS = 3;

export interface BetaScaleConfig {
  readonly epsilon?: number;
  readonly renormalize?: boolean;
}

export interface BetaScaleResult {
  readonly weights: Record<string, number>;
  readonly betaApplied: boolean | 'neutralized';
  readonly fallbackReason?: string;
}

export function estimateRollingBetas(
  assetReturns: readonly AssetReturnSeries[],
  benchmarkReturns: AssetReturnSeries,
  window: number,
  minObs: number,
  sizingTime: number = Number.POSITIVE_INFINITY,
): Record<string, number | null> {
  requirePositiveInteger(window, 'window');
  requirePositiveInteger(minObs, 'minObs');
  if (Number.isNaN(sizingTime)) throw new Error('estimateRollingBetas: sizingTime must not be NaN');
  requireAlignedSeries(benchmarkReturns);

  const benchmarkByTs = new Map<number, number>();
  for (let i = 0; i < benchmarkReturns.timestamps.length; i++) {
    const ts = benchmarkReturns.timestamps[i]!;
    if (ts < sizingTime) benchmarkByTs.set(ts, benchmarkReturns.returns[i]!);
  }

  const out: Record<string, number | null> = {};
  for (const series of assetReturns) {
    requireAlignedSeries(series);
    const pairs = alignedPairs(series, benchmarkByTs, sizingTime, window);
    const valid = pairs.asset.length >= minObs && pairs.asset.length >= OLS_MIN_OBS && variance(pairs.benchmark) > 0;
    out[series.symbol] = valid ? computeFactorExposure(pairs.asset, pairs.benchmark, 'benchmark').exposure : null;
  }
  return out;
}
