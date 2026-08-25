// Tests for return-metrics (plan §3 Step C).
// Hand-verified Sharpe/Sortino fixture; max drawdown on equity curve.

import { describe, it, expect } from 'vitest';
import {
  annualizedSharpe,
  annualizedSortino,
  maxDrawdownPct,
  compoundReturn,
} from './return-metrics';

describe('return-metrics', () => {
  describe('compoundReturn', () => {
    it('compounds correctly on hand-verified fixture', () => {
      // 1.01 * 0.99 * 1.02 - 1 = 0.019898 (floating point)
      const returns = [0.01, -0.01, 0.02];
      expect(compoundReturn(returns)).toBeCloseTo(0.019898, 10);
    });

    it('returns -1 for total loss', () => {
      expect(compoundReturn([-1])).toBe(-1);
    });

    it('returns 0 for empty array', () => {
      expect(compoundReturn([])).toBe(0);
    });
  });

  describe('maxDrawdownPct', () => {
    it('matches hand computation on equity curve', () => {
      // Equity: 1 → 1.1 (peak) → 1.0 (dd 9.09%) → 0.9 (dd 18.18%) → 1.05 (new peak 5%)
      const equity = [1, 1.1, 1.0, 0.9, 1.05];
      const dd = maxDrawdownPct(equity);
      expect(dd).toBeCloseTo(18.1818, 3); // (1.1 - 0.9) / 1.1 * 100
    });

    it('returns 0 for monotonic rising equity', () => {
      const equity = [1, 1.1, 1.2, 1.3];
      expect(maxDrawdownPct(equity)).toBe(0);
    });

    it('returns 0 for empty curve', () => {
      expect(maxDrawdownPct([])).toBe(0);
    });

    it('handles non-positive peak gracefully', () => {
      // peak is 0, skip divide
      const equity = [0, 0, -1];
      expect(maxDrawdownPct(equity)).toBe(0);
    });
  });

  describe('annualizedSharpe', () => {
    it('returns null for < 2 observations', () => {
      expect(annualizedSharpe([0.01], 252)).toBeNull();
      expect(annualizedSharpe([], 252)).toBeNull();
    });

    it('returns null for zero variance', () => {
      expect(annualizedSharpe([0.01, 0.01, 0.01], 252)).toBeNull();
    });

    it('hand-verified fixture: daily returns mean 0.001, std 0.01, 252 periods/yr', () => {
      // mean = 0.001, std = 0.01, sqrt(252) ≈ 15.8745
      // Sharpe = (0.001 / 0.01) * 15.8745 = 1.58745
      const syntheticReturns = Array(100).fill(0).map((_, i) => 0.001 + (i % 2 ? 0.01 : -0.01));
      // Actually let's use a precise fixture:
      // returns: [0.02, -0.01, 0.03, 0.00, 0.01] -> mean = 0.01, std ≈ 0.0114
      const preciseReturns = [0.02, -0.01, 0.03, 0.0, 0.01];
      const mean = 0.01;
      const variance = preciseReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / preciseReturns.length;
      const std = Math.sqrt(variance);
      const expected = (mean / std) * Math.sqrt(252);
      expect(annualizedSharpe(preciseReturns, 252)).toBeCloseTo(expected, 10);
      // Also verify the synthetic array gives approximately the same
      const synthMean = syntheticReturns.reduce((a, b) => a + b, 0) / syntheticReturns.length;
      const synthVar = syntheticReturns.reduce((a, b) => a + (b - synthMean) ** 2, 0) / syntheticReturns.length;
      const synthStd = Math.sqrt(synthVar);
      const expectedSynth = synthStd === 0 ? null : (synthMean / synthStd) * Math.sqrt(252);
      expect(annualizedSharpe(syntheticReturns, 252)).toBeCloseTo(expectedSynth ?? 0, 5);
    });

    it('throws on non-positive periodsPerYear', () => {
      expect(() => annualizedSharpe([0.01, 0.02], 0)).toThrow();
      expect(() => annualizedSharpe([0.01, 0.02], -1)).toThrow();
      expect(() => annualizedSharpe([0.01, 0.02], NaN)).toThrow();
    });
  });

  describe('annualizedSortino', () => {
    it('returns null for < 2 observations', () => {
      expect(annualizedSortino([0.01], 252)).toBeNull();
      expect(annualizedSortino([], 252)).toBeNull();
    });

    it('returns null when no downside returns', () => {
      // All positive returns -> downsideStd = 0
      expect(annualizedSortino([0.01, 0.02, 0.03], 252)).toBeNull();
    });

    it('hand-verified fixture', () => {
      // returns: [-0.02, 0.01, -0.01, 0.03, 0.02]
      // mean = 0.006, downside = [-0.02, -0.01], downsideVar = (0.0004 + 0.0001)/5 = 0.0001
      // downsideStd = 0.01, Sortino = (0.006 / 0.01) * sqrt(252) = 0.6 * 15.8745 = 9.5247
      const returns = [-0.02, 0.01, -0.01, 0.03, 0.02];
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const downsideVar = returns.filter(r => r < 0).reduce((a, r) => a + r ** 2, 0) / returns.length;
      const downsideStd = Math.sqrt(downsideVar);
      const expected = downsideStd === 0 ? null : (mean / downsideStd) * Math.sqrt(252);
      expect(annualizedSortino(returns, 252)).toBeCloseTo(expected ?? 0, 10);
    });

    it('throws on non-positive periodsPerYear', () => {
      expect(() => annualizedSortino([0.01, -0.01], 0)).toThrow();
      expect(() => annualizedSortino([0.01, -0.01], -1)).toThrow();
    });
  });
});