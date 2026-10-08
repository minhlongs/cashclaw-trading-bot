import { describe, it, expect } from 'vitest';
import {
  computeAnnualizedFundingRate,
  computeBasisSpread,
  evaluateArbitrageOpportunity,
} from './basis-calculator';
import type { FundingRateRecord } from './funding-types';

describe('Basis & Funding Rate Calculator', () => {
  it('correctly annualizes 8-hour funding rates', () => {
    // 0.01% per 8 hours -> 0.0001 * 3 * 365 = 0.1095 (10.95%)
    const annualized = computeAnnualizedFundingRate(0.0001);
    expect(annualized).toBeCloseTo(0.1095, 4);
    expect(computeAnnualizedFundingRate(NaN)).toBe(0);
  });

  it('computes spot vs perp basis spread accurately', () => {
    const basis = computeBasisSpread('BTC/USDT', 'binance', 'bybit', 60000, 60300, 1700000000);
    expect(basis.basisAbsolute).toBe(300);
    expect(basis.basisPercentage).toBeCloseTo(0.005, 4); // 0.5% premium
  });

  it('throws on non-positive or invalid spot/perp prices', () => {
    expect(() => computeBasisSpread('BTC/USDT', 'binance', 'bybit', 0, 60000, 1700000000)).toThrow();
    expect(() => computeBasisSpread('BTC/USDT', 'binance', 'bybit', 60000, -10, 1700000000)).toThrow();
  });

  it('evaluates arbitrage opportunity and determines viability', () => {
    const binanceFunding: FundingRateRecord = {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      rate: 0.0005, // 0.05% per 8h -> ~54.75% ann
      annualizedRate: computeAnnualizedFundingRate(0.0005),
      nextFundingTimeMs: 1700000000 + 28800000,
      timestampMs: 1700000000,
    };

    const okxFunding: FundingRateRecord = {
      exchange: 'okx',
      symbol: 'BTC/USDT',
      rate: 0.0001, // 0.01% per 8h -> ~10.95% ann
      annualizedRate: computeAnnualizedFundingRate(0.0001),
      nextFundingTimeMs: 1700000000 + 28800000,
      timestampMs: 1700000000,
    };

    const opp = evaluateArbitrageOpportunity(binanceFunding, okxFunding);
    expect(opp.symbol).toBe('BTC/USDT');
    expect(opp.shortVenue).toBe('binance'); // short higher funding
    expect(opp.longVenue).toBe('okx'); // long lower funding
    expect(opp.fundingSpread).toBeCloseTo(0.0004, 6);
    expect(opp.isViable).toBe(true);
  });

  it('throws when evaluating opportunities with symbol mismatch', () => {
    const binanceFunding: FundingRateRecord = {
      exchange: 'binance',
      symbol: 'BTC/USDT',
      rate: 0.0005,
      annualizedRate: 0.54,
      nextFundingTimeMs: 0,
      timestampMs: 0,
    };
    const okxFunding: FundingRateRecord = {
      exchange: 'okx',
      symbol: 'ETH/USDT',
      rate: 0.0001,
      annualizedRate: 0.1,
      nextFundingTimeMs: 0,
      timestampMs: 0,
    };
    expect(() => evaluateArbitrageOpportunity(binanceFunding, okxFunding)).toThrow(/Symbol mismatch/);
  });
});
