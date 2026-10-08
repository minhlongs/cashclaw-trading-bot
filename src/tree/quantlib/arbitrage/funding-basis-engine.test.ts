import { describe, expect, it } from 'vitest';
import { FundingBasisEngine } from './funding-basis-engine';
import type { VenueFundingQuote } from './funding-basis-types';

describe('FundingBasisEngine', () => {
  const engine = new FundingBasisEngine({
    minHurdleRateAnnual: 0.10, // 10%
    minLiquidationDistance: 0.15, // 15%
    defaultHoldingDays: 30,
    annualBorrowRate: 0.02,
  });

  const binanceQuote: VenueFundingQuote = {
    venueId: 'binance',
    symbol: 'BTC-USDT',
    fundingRate: 0.0003, // 0.03% per 8h => 32.85% annual
    fundingIntervalHours: 8,
    markPrice: 60000,
    takerFeeRate: 0.0004,
    liquidationPrice: 75000, // Short side liq: +25%
  };

  const okxQuote: VenueFundingQuote = {
    venueId: 'okx',
    symbol: 'BTC-USDT',
    fundingRate: 0.00005, // 0.005% per 8h => 5.475% annual
    fundingIntervalHours: 8,
    markPrice: 60000,
    takerFeeRate: 0.0004,
    liquidationPrice: 48000, // Long side liq: -20%
  };

  it('correctly annualizes 8h and 1h funding rates', () => {
    // 0.01% per 8h => 0.0001 * 3 * 365 = 10.95%
    const rate8h = engine.annualizeFundingRate(0.0001, 8);
    expect(rate8h).toBeCloseTo(0.1095, 6);

    // 0.001% per 1h => 0.00001 * 24 * 365 = 8.76%
    const rate1h = engine.annualizeFundingRate(0.00001, 1);
    expect(rate1h).toBeCloseTo(0.0876, 6);

    expect(() => engine.annualizeFundingRate(0.0001, 0)).toThrow('Funding interval must be positive and finite.');
  });

  it('evaluates profitable basis arbitrage opportunity and recommends EXECUTE', () => {
    const opp = engine.evaluatePair(binanceQuote, okxQuote, 30);

    expect(opp.shortVenueId).toBe('binance');
    expect(opp.longVenueId).toBe('okx');
    expect(opp.grossAnnualYield).toBeGreaterThan(0.25);
    expect(opp.netAnnualYield).toBeGreaterThan(0.10);
    expect(opp.status).toBe('EXECUTE');
    expect(opp.minLiquidationDistance).toBeCloseTo(0.20, 2);
  });

  it('rejects arbitrage when liquidation buffer is below threshold', () => {
    const dangerousQuote: VenueFundingQuote = {
      ...okxQuote,
      liquidationPrice: 55000, // only ~8.3% distance
    };
    const opp = engine.evaluatePair(binanceQuote, dangerousQuote, 30);
    expect(opp.status).toBe('REJECT');
    expect(opp.minLiquidationDistance).toBeLessThan(0.15);
  });

  it('recommends HOLD or UNWIND when yields are sub-hurdle or negative', () => {
    const tightQuote: VenueFundingQuote = {
      ...okxQuote,
      fundingRate: 0.0002, // Gross yield ~10.95%, net yield ~7% (< 10% hurdle)
    };
    const oppHold = engine.evaluatePair(binanceQuote, tightQuote, 30);
    expect(oppHold.status).toBe('HOLD');

    const invertedQuote: VenueFundingQuote = {
      ...okxQuote,
      fundingRate: 0.0005, // higher than Binance => negative net yield
    };
    const oppUnwind = engine.evaluatePair(binanceQuote, invertedQuote, 30);
    expect(oppUnwind.status).toBe('UNWIND');
  });

  it('finds best opportunity across multiple venues', () => {
    const bybitQuote: VenueFundingQuote = {
      venueId: 'bybit',
      symbol: 'BTC-USDT',
      fundingRate: -0.0001, // Negative funding (-10.95% annual)
      fundingIntervalHours: 8,
      markPrice: 60000,
      takerFeeRate: 0.0004,
      liquidationPrice: 45000,
    };

    const quotes = [binanceQuote, okxQuote, bybitQuote];
    const best = engine.findBestOpportunity(quotes, 30);

    expect(best).not.toBeNull();
    // Best should be short Binance (+32.85%) and long Bybit (-10.95%), gross spread ~43.8%
    expect(best?.shortVenueId).toBe('binance');
    expect(best?.longVenueId).toBe('bybit');
    expect(best?.grossAnnualYield).toBeCloseTo(0.438, 2);
  });

  it('returns null when less than 2 quotes are provided', () => {
    expect(engine.findBestOpportunity([])).toBeNull();
    expect(engine.findBestOpportunity([binanceQuote])).toBeNull();
  });

  it('calculates default liquidation distance using leverage and margin ratio when prices omitted', () => {
    const quoteNoLiq1: VenueFundingQuote = { ...binanceQuote, liquidationPrice: undefined };
    const quoteNoLiq2: VenueFundingQuote = { ...okxQuote, liquidationPrice: undefined };

    const opp = engine.evaluatePair(quoteNoLiq1, quoteNoLiq2, 30);
    // Default leverage 3 => 1/3 - 0.05 = ~0.2833
    expect(opp.minLiquidationDistance).toBeCloseTo(1 / 3 - 0.05, 4);
  });
});
