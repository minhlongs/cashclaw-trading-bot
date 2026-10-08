// Multi-Venue Basis & Funding Rate Calculator
// Pure computational functions with 0 external side-effects

import type {
  FundingRateRecord,
  BasisSpreadRecord,
  ArbitrageOpportunity,
} from './funding-types';

export const ROUND_TRIP_FEE_ESTIMATE_PCT = 0.001; // 10 bps total taker/maker drag buffer
export const MIN_VIABLE_ANNUALIZED_YIELD = 0.05; // 5% minimum net yield floor

export function computeAnnualizedFundingRate(eightHourRate: number): number {
  if (!Number.isFinite(eightHourRate)) return 0;
  return eightHourRate * 3 * 365;
}

export function computeBasisSpread(
  symbol: string,
  spotExchange: BasisSpreadRecord['spotExchange'],
  perpExchange: BasisSpreadRecord['perpExchange'],
  spotPrice: number,
  perpPrice: number,
  timestampMs: number,
): BasisSpreadRecord {
  if (!Number.isFinite(spotPrice) || spotPrice <= 0) {
    throw new Error('Invalid spot price: must be positive finite number');
  }
  if (!Number.isFinite(perpPrice) || perpPrice <= 0) {
    throw new Error('Invalid perp price: must be positive finite number');
  }

  const basisAbsolute = perpPrice - spotPrice;
  const basisPercentage = basisAbsolute / spotPrice;

  return {
    symbol,
    spotExchange,
    perpExchange,
    spotPrice,
    perpPrice,
    basisAbsolute,
    basisPercentage,
    timestampMs,
  };
}

export function evaluateArbitrageOpportunity(
  venueA: FundingRateRecord,
  venueB: FundingRateRecord,
  basisSpreadPct = 0,
  feeDragPct = ROUND_TRIP_FEE_ESTIMATE_PCT,
): ArbitrageOpportunity {
  if (venueA.symbol !== venueB.symbol) {
    throw new Error(`Symbol mismatch: ${venueA.symbol} vs ${venueB.symbol}`);
  }

  // Short the higher funding rate venue, Long the lower funding rate venue
  const higherRateVenue = venueA.rate >= venueB.rate ? venueA : venueB;
  const lowerRateVenue = venueA.rate >= venueB.rate ? venueB : venueA;

  const fundingSpread = higherRateVenue.rate - lowerRateVenue.rate;
  const rawAnnualized = fundingSpread * 3 * 365;
  const annualizedNetYield = rawAnnualized - feeDragPct;
  const isViable = annualizedNetYield >= MIN_VIABLE_ANNUALIZED_YIELD;

  return {
    symbol: venueA.symbol,
    longVenue: lowerRateVenue.exchange,
    shortVenue: higherRateVenue.exchange,
    fundingSpread,
    annualizedNetYield,
    basisSpreadPct,
    estimatedFeeDragPct: feeDragPct,
    isViable,
    timestampMs: Math.max(venueA.timestampMs, venueB.timestampMs),
  };
}
