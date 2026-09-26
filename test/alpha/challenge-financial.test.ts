import { describe, it, expect } from 'vitest';
import {
  checkMinTrades,
  checkMinNetExpectancy,
  checkMinProfitFactor,
  checkMaxDrawdown,
  checkMinSharpeSortino,
  checkMinRegimeCoverage,
} from '../../src/forest/alpha/gate/financial-checks';
import { GateCheckSchema } from '../../src/forest/alpha/gate/schemas';

describe('Adversarial Challenge: Financial Checks 1-6', () => {
  it('Check 1 (minTrades): 29 vs 30, negative, float 29.9, and non-finites', () => {
    expect(GateCheckSchema.parse(checkMinTrades(29)).passed).toBe(false);
    expect(GateCheckSchema.parse(checkMinTrades(30)).passed).toBe(true);
    expect(checkMinTrades(31).passed).toBe(true);
    expect(checkMinTrades(-1).passed).toBe(false);
    expect(checkMinTrades(-30).passed).toBe(false);
    expect(checkMinTrades(29.9).passed).toBe(false);
    expect(checkMinTrades(30.1).passed).toBe(false);
    expect(checkMinTrades(Number.NaN).passed).toBe(false);
    expect(checkMinTrades(Number.POSITIVE_INFINITY).passed).toBe(false);
    expect(checkMinTrades(Number.NEGATIVE_INFINITY).passed).toBe(false);
  });

  it('Check 2 (minNetExpectancy): 0.0 vs 0.0001, -0.0001, NaN, and Infinities', () => {
    expect(GateCheckSchema.parse(checkMinNetExpectancy(0.0)).passed).toBe(false);
    expect(GateCheckSchema.parse(checkMinNetExpectancy(0.0001)).passed).toBe(true);
    expect(checkMinNetExpectancy(Number.EPSILON).passed).toBe(true);
    expect(checkMinNetExpectancy(-0.0001).passed).toBe(false);
    expect(checkMinNetExpectancy(-Number.EPSILON).passed).toBe(false);
    expect(checkMinNetExpectancy(Number.NaN).passed).toBe(false);
    expect(checkMinNetExpectancy(Number.NaN).actual).toBeNull();
    expect(checkMinNetExpectancy(Number.POSITIVE_INFINITY).passed).toBe(false);
    expect(checkMinNetExpectancy(Number.NEGATIVE_INFINITY).passed).toBe(false);
  });

  it('Check 3 (minProfitFactor): 1.199 vs 1.200, Infinity, zero loss, zero win', () => {
    expect(GateCheckSchema.parse(checkMinProfitFactor(1.199)).passed).toBe(false);
    expect(GateCheckSchema.parse(checkMinProfitFactor(1.200)).passed).toBe(true);
    expect(GateCheckSchema.parse(checkMinProfitFactor(Number.POSITIVE_INFINITY)).passed).toBe(true);
    // zero loss: grossProfit > 0, grossLoss = 0 => grossProfit / 0 = Infinity
    expect(checkMinProfitFactor(1000 / 0).passed).toBe(true);
    // zero win: grossProfit = 0, grossLoss > 0 => 0 / grossLoss = 0
    expect(checkMinProfitFactor(0 / 1000).passed).toBe(false);
    // zero win and zero loss: 0 / 0 = NaN
    expect(checkMinProfitFactor(0 / 0).passed).toBe(false);
    expect(checkMinProfitFactor(-1.2).passed).toBe(false);
    expect(checkMinProfitFactor(Number.NEGATIVE_INFINITY).passed).toBe(false);
  });

  it('Check 4 (maxDrawdown): 0.250 vs 0.251, 0.0, 1.0, and negatives/NaN', () => {
    expect(GateCheckSchema.parse(checkMaxDrawdown(0.250)).passed).toBe(true);
    expect(GateCheckSchema.parse(checkMaxDrawdown(0.251)).passed).toBe(false);
    expect(checkMaxDrawdown(0.0).passed).toBe(true);
    expect(checkMaxDrawdown(1.0).passed).toBe(false);
    expect(checkMaxDrawdown(1.5).passed).toBe(false);
    expect(checkMaxDrawdown(-0.01).passed).toBe(false);
    expect(checkMaxDrawdown(Number.NaN).passed).toBe(false);
    expect(checkMaxDrawdown(Number.POSITIVE_INFINITY).passed).toBe(false);
  });

  it('Check 5 (minSharpeSortino): Sharpe 0.999/Sortino 1.5, Sharpe 1.5/Sortino 1.199, nulls, infinities', () => {
    expect(GateCheckSchema.parse(checkMinSharpeSortino(0.999, 1.5)).passed).toBe(false);
    expect(GateCheckSchema.parse(checkMinSharpeSortino(1.5, 1.199)).passed).toBe(false);
    expect(GateCheckSchema.parse(checkMinSharpeSortino(1.0, 1.2)).passed).toBe(true);
    expect(checkMinSharpeSortino(null, 1.5).passed).toBe(false);
    expect(checkMinSharpeSortino(1.5, null).passed).toBe(false);
    expect(checkMinSharpeSortino(null, null).passed).toBe(false);
    expect(checkMinSharpeSortino(Number.POSITIVE_INFINITY, 1.5).passed).toBe(true);
    expect(checkMinSharpeSortino(1.5, Number.POSITIVE_INFINITY).passed).toBe(true);
    expect(checkMinSharpeSortino(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY).passed).toBe(true);
    expect(checkMinSharpeSortino(Number.NEGATIVE_INFINITY, 1.5).passed).toBe(false);
    expect(checkMinSharpeSortino(Number.NaN, 1.5).passed).toBe(false);
    expect(checkMinSharpeSortino(1.5, Number.NaN).passed).toBe(false);
  });

  it('Check 6 (minRegimeCoverage): 0 regimes, 49% vs 50%, losing regimes in denominator', () => {
    expect(checkMinRegimeCoverage({}).passed).toBe(false);
    expect(checkMinRegimeCoverage({ r1: { numTrades: 0, netPnl: 100 } }).passed).toBe(false);

    // 49% vs 50%
    const r49: Record<string, { numTrades: number; netPnl: number }> = {};
    for (let i = 0; i < 100; i++) r49[`r_${i}`] = { numTrades: 10, netPnl: i < 49 ? 100 : -100 };
    expect(checkMinRegimeCoverage(r49).passed).toBe(false);

    const r50: Record<string, { numTrades: number; netPnl: number }> = {};
    for (let i = 0; i < 100; i++) r50[`r_${i}`] = { numTrades: 10, netPnl: i < 50 ? 100 : -100 };
    expect(checkMinRegimeCoverage(r50).passed).toBe(true);

    // Losing regimes counted in denominator: 3/6 = 50% passes, 3/7 = 42.8% fails
    const r6 = {
      r1: { numTrades: 10, netPnl: 50 }, r2: { numTrades: 10, netPnl: 40 }, r3: { numTrades: 10, netPnl: 30 },
      r4: { numTrades: 10, netPnl: -10 }, r5: { numTrades: 10, netPnl: -20 }, r6: { numTrades: 10, netPnl: -30 },
    };
    expect(checkMinRegimeCoverage(r6).passed).toBe(true);
    expect(checkMinRegimeCoverage({ ...r6, r7: { numTrades: 10, netPnl: -5 } }).passed).toBe(false);

    // Breakeven counted in denominator, not numerator
    expect(checkMinRegimeCoverage({ r1: { numTrades: 10, netPnl: 50 }, r2: { numTrades: 10, netPnl: 0 } }).passed).toBe(true);
    expect(checkMinRegimeCoverage({ r1: { numTrades: 10, netPnl: 50 }, r2: { numTrades: 10, netPnl: 0 }, r3: { numTrades: 10, netPnl: 0 } }).passed).toBe(false);
  });
});
