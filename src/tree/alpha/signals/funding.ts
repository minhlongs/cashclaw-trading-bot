// Non-TA signal sources — funding rate, open interest, liquidation, basis.
// Facade re-exporting types, API fetchers, and feature computation.

export type {
  FundingRatePoint,
  OpenInterestPoint,
  LiquidationPoint,
  DerivativeFeatures,
} from './funding-types';

export {
  fetchFundingRate,
  fetchOpenInterestHistory,
  fetchLiquidations,
  fetchPremiumIndex,
} from './funding-api';

export {
  rollingMean,
  rollingStd,
  fundingFields,
  oiFields,
  liquidationFields,
  basisFields,
  computeDerivativeFeatures,
} from './funding-features';
