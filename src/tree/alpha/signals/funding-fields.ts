import type { FundingRatePoint, OpenInterestPoint } from './funding-types';
import { rollingMean, rollingStd } from './funding-stats';

export function fundingFields(funding: FundingRatePoint[], t: number) {
  const hist = funding.filter(f => f.timestamp <= t).map(f => f.fundingRate);
  return {
    fundingRate: hist.length > 0 ? hist[hist.length - 1] : null,
    fundingRateAvg8h: rollingMean(hist, 3),
    fundingRateSlope: hist.length >= 3 ? hist[hist.length - 1] - hist[hist.length - 3] : null,
  };
}

export function oiFields(oi: OpenInterestPoint[], t: number, lookbackBars: number) {
  const hist = oi.filter(o => o.timestamp <= t && o.notionalUsd !== null).map(o => o.notionalUsd as number);
  return {
    openInterest: hist.length > 0 ? hist[hist.length - 1] : null,
    oiChange: hist.length >= 2 ? (hist[hist.length - 1] - hist[hist.length - 2]) / hist[hist.length - 2] : null,
    oiZScore: hist.length >= lookbackBars
      ? (hist[hist.length - 1] - (rollingMean(hist, lookbackBars) ?? 0)) / (rollingStd(hist, lookbackBars) ?? 1)
      : null,
  };
}
