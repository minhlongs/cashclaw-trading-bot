import { describe, it, expect } from 'vitest';
import { VectorizedFactorEngine } from './vectorized-factor-engine';

describe('VectorizedFactorEngine', () => {
  const engine = new VectorizedFactorEngine();

  it('computes exact Pearson correlation for linear vectors', () => {
    const x = new Float64Array([1, 2, 3, 4, 5]);
    const y = new Float64Array([2, 4, 6, 8, 10]);
    const corr = engine.computePearsonCorrelation(x, y);
    expect(corr).toBeCloseTo(1.0, 5);

    const negY = new Float64Array([10, 8, 6, 4, 2]);
    const negCorr = engine.computePearsonCorrelation(x, negY);
    expect(negCorr).toBeCloseTo(-1.0, 5);
  });

  it('handles degenerate or zero-variance vectors safely', () => {
    const x = new Float64Array([1, 1, 1, 1]);
    const y = new Float64Array([2, 3, 4, 5]);
    expect(engine.computePearsonCorrelation(x, y)).toBe(0);

    const shortX = new Float64Array([1]);
    const shortY = new Float64Array([2]);
    expect(engine.computePearsonCorrelation(shortX, shortY)).toBe(0);
  });

  it('computes monotonic Spearman rank correlation accurately', () => {
    const x = new Float64Array([1, 2, 5, 10, 20]);
    const y = new Float64Array([10, 20, 50, 100, 200]);
    const spearman = engine.computeSpearmanCorrelation(x, y);
    expect(spearman).toBeCloseTo(1.0, 5);
  });

  it('calculates factor IC metrics with t-statistic and approximate p-value', () => {
    const factor = {
      name: 'MOMENTUM_10D',
      data: new Float64Array([0.1, 0.4, 0.2, 0.8, 0.9, -0.1, 0.3, 0.5, 0.6, 0.7]),
    };
    const fwdReturns = new Float64Array([0.01, 0.04, 0.02, 0.09, 0.08, -0.02, 0.03, 0.05, 0.06, 0.07]);

    const ic = engine.computeFactorIc(factor, fwdReturns);
    expect(ic.factorName).toBe('MOMENTUM_10D');
    expect(ic.pearsonIc).toBeGreaterThan(0.9);
    expect(ic.spearmanIc).toBeGreaterThan(0.9);
    expect(ic.observations).toBe(10);
    expect(ic.tStatistic).toBeGreaterThan(2);
    expect(ic.pValueApprox).toBeLessThan(0.05);
  });

  it('computes quantile spreads and detects positive monotonic score', () => {
    const factorData = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const returns = new Float64Array([0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.10]);

    const spread = engine.computeQuantileSpread(factorData, returns, 5);
    expect(spread.topQuantileMeanReturn).toBeCloseTo(0.095, 5);
    expect(spread.bottomQuantileMeanReturn).toBeCloseTo(0.015, 5);
    expect(spread.longShortSpread).toBeCloseTo(0.08, 5);
    expect(spread.monotonicScore).toBe(1);
  });

  it('returns zero metrics when observations are less than quantiles', () => {
    const shortF = new Float64Array([1, 2]);
    const shortR = new Float64Array([0.01, 0.02]);
    const spread = engine.computeQuantileSpread(shortF, shortR, 5);
    expect(spread.longShortSpread).toBe(0);
    expect(spread.monotonicScore).toBe(0);
  });
});
