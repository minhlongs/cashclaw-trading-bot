// Multi-Venue Basis & Funding Rate Arbitrage Types
// ADR-001 Invariant: Paper-only research and simulation contracts

import type { ExchangeId } from '../types';

export interface FundingRateRecord {
  readonly exchange: ExchangeId;
  readonly symbol: string; // Canonical BASE/QUOTE
  readonly rate: number; // 8-hour funding rate (e.g., 0.0001 for 0.01%)
  readonly annualizedRate: number; // rate * 3 * 365
  readonly nextFundingTimeMs: number;
  readonly timestampMs: number;
}

export interface BasisSpreadRecord {
  readonly symbol: string;
  readonly spotExchange: ExchangeId;
  readonly perpExchange: ExchangeId;
  readonly spotPrice: number;
  readonly perpPrice: number;
  readonly basisAbsolute: number; // perpPrice - spotPrice
  readonly basisPercentage: number; // (perpPrice - spotPrice) / spotPrice
  readonly timestampMs: number;
}

export interface ArbitrageOpportunity {
  readonly symbol: string;
  readonly longVenue: ExchangeId;
  readonly shortVenue: ExchangeId;
  readonly fundingSpread: number; // shortRate - longRate
  readonly annualizedNetYield: number; // Annualized yield net of estimated fee drag
  readonly basisSpreadPct: number;
  readonly estimatedFeeDragPct: number;
  readonly isViable: boolean;
  readonly timestampMs: number;
}
