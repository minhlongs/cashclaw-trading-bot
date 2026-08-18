// Non-TA signal sources — barrel export.
export type {
  FundingRatePoint,
  OpenInterestPoint,
  LiquidationPoint,
  DerivativeFeatures,
} from './funding';
export type { DerivativeSignal } from './generator';
export {
  fetchFundingRate,
  fetchOpenInterestHistory,
  fetchLiquidations,
  fetchPremiumIndex,
  computeDerivativeFeatures,
} from './funding';
export { generateDerivativeSignals } from './generator';
export {
  loadDerivativeCache,
  saveDerivativeCache,
  clearDerivativeCache,
  derivativeCacheKey,
} from './cache';