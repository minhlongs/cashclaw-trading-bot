// Type definitions for derivative signals (funding rate, open interest, liquidation, basis).

export interface FundingRatePoint {
  timestamp: number;
  symbol: string;
  fundingRate: number; // perpetual funding rate (e.g. 0.0001 = 0.01%)
  markPrice: number;
}

export interface OpenInterestPoint {
  timestamp: number;
  symbol: string;
  openInterest: number; // contract notional (raw, from Binance)
  notionalUsd: number | null; // null when the source endpoint has no price to convert with
}

export interface LiquidationPoint {
  timestamp: number;
  symbol: string;
  side: 'long' | 'short';
  price: number;
  quantity: number;
  notionalUsd: number;
}

export interface DerivativeFeatures {
  timestamp: number;
  fundingRate: number | null;
  fundingRateAvg8h: number | null;
  fundingRateSlope: number | null; // change over lookback
  openInterest: number | null;
  oiChange: number | null; // % change over lookback
  oiZScore: number | null;
  liquidationImbalance: number | null; // long - short notional
  liquidationZScore: number | null;
  basis: number | null; // (futures - spot) / spot
  basisZScore: number | null;
}
