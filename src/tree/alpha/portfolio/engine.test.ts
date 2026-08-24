import { describe, it, expect } from 'vitest';
import type { ComposedAlpha } from '../composition/types';
import { RegimeLabel } from '@/tree/regime/types';
import { buildPortfolio, type EngineScoredAlpha } from './engine';
import type { PortfolioConfig, PortfolioResult, RiskInputs } from './types';

function makeAlpha(overrides: Partial<ComposedAlpha> = {}): ComposedAlpha {
  return {
    alphaId: 'alpha-1', direction: 'buy', confidence: 1,
    expectedReturn: 0.05, expectedCost: 0.01, expectedTurnover: 0.4,
    regime: RegimeLabel.RANGE, horizon: '1h', provenance: 'test-fixture',
    featureDependencies: [], timestamp: 1_700_000_000_000,
    ...overrides,
  };
}

/** Config where every overlay is loose (never binds). */
const LOOSE: PortfolioConfig = {
  targetVolatility: 1, maxPositionWeight: 100, maxGrossExposure: 100,
  maxNetExposure: 100, maxCorrelatedExposure: 100, correlationBucketThreshold: 2,
  maxBetaExposure: 100, maxTurnover: 100, drawdownThreshold: 1, deRiskFactor: 0.5,
};

/** Risk inputs where every overlay is loose (vol=0 skips targeting). */
function looseRisk(overrides: Partial<RiskInputs> = {}): RiskInputs {
  return {
    realizedVolatility: 0,
    correlationMatrix: new Map(),
    betas: new Map(),
    currentDrawdown: 0,
    ...overrides,
  };
}

function scored(
  specs: readonly { id: string; score: number; direction?: 'buy' | 'sell'; confidence?: number }[],
): EngineScoredAlpha[] {
  return specs.map(({ id, score, direction = 'buy', confidence = 1 }) => ({
    alpha: makeAlpha({ alphaId: id, direction, confidence }),
    score,
  }));
}

function weights(r: PortfolioResult): Map<string, number> {
  return new Map(r.positions.map((p) => [p.alphaId, p.targetWeight]));
}

describe('buildPortfolio — sequential risk overlays', () => {
  it('base weight: score x direction x confidence when nothing binds', () => {
    const buy = buildPortfolio(scored([{ id: 'a', score: 0.5, confidence: 0.8 }]), new Map(), looseRisk(), LOOSE);
    expect(buy.positions[0].targetWeight).toBeCloseTo(0.4, 12);
    expect(buy.grossExposure).toBeCloseTo(0.4, 12);
    expect(buy.netExposure).toBeCloseTo(0.4, 12);
    expect(buy.riskAdjustments).toEqual([]);
    const sell = buildPortfolio(scored([{ id: 'a', score: 0.5, direction: 'sell', confidence: 0.8 }]), new Map(), looseRisk(), LOOSE);
    expect(sell.positions[0].targetWeight).toBeCloseTo(-0.4, 12);
    expect(sell.netExposure).toBeCloseTo(-0.4, 12);
  });

  it('volatility targeting scales gross so gross x realizedVol hits target', () => {
    const risk = looseRisk({ realizedVolatility: 0.1 });
    const r = buildPortfolio(
      scored([{ id: 'a', score: 0.3 }, { id: 'b', score: 0.2, direction: 'sell' }]),
      new Map(), risk, { ...LOOSE, targetVolatility: 0.04 },
    );
    expect(r.grossExposure).toBeCloseTo(0.4, 10);
    expect(r.grossExposure * risk.realizedVolatility).toBeCloseTo(0.04, 10);
    expect(r.riskAdjustments.join(' ')).toContain('vol target');
  });

  it('position cap clips oversized position exactly to cap, others untouched', () => {
    const r = buildPortfolio(
      scored([{ id: 'a', score: 0.5, confidence: 0.8 }, { id: 'b', score: 0.1 }]),
      new Map(), looseRisk(), { ...LOOSE, maxPositionWeight: 0.25 },
    );
    const w = weights(r);
    expect(w.get('a')).toBeCloseTo(0.25, 12);
    expect(w.get('b')).toBeCloseTo(0.1, 12);
    expect(r.riskAdjustments.join(' ')).toContain('position cap');
  });

  it('gross exposure scales all weights proportionally down to cap', () => {
    const r = buildPortfolio(
      scored([{ id: 'a', score: 0.3 }, { id: 'b', score: 0.35 }]),
      new Map(), looseRisk(), { ...LOOSE, maxGrossExposure: 0.5 },
    );
    const w = weights(r);
    expect(r.grossExposure).toBeCloseTo(0.5, 10);
    expect(w.get('a')! / w.get('b')!).toBeCloseTo(0.3 / 0.35, 10);
    expect(r.riskAdjustments.join(' ')).toContain('gross exposure');
  });

  it('net exposure caps long-heavy portfolio at maxNetExposure', () => {
    const r = buildPortfolio(
      scored([{ id: 'a', score: 0.3 }, { id: 'b', score: 0.3 }]),
      new Map(), looseRisk(), { ...LOOSE, maxNetExposure: 0.5 },
    );
    expect(r.netExposure).toBeCloseTo(0.5, 10);
    expect(r.riskAdjustments.join(' ')).toContain('net exposure');
  });

  it('correlated bucket scales proportionally, leaves uncorrelated untouched', () => {
    const corr = new Map([
      ['a', new Map([['b', 0.95], ['c', 0.1]])],
      ['b', new Map([['a', 0.95], ['c', 0.1]])],
      ['c', new Map([['a', 0.1], ['b', 0.1]])],
    ]);
    const r = buildPortfolio(
      scored([{ id: 'a', score: 0.3 }, { id: 'b', score: 0.25 }, { id: 'c', score: 0.2 }]),
      new Map(), looseRisk({ correlationMatrix: corr }),
      { ...LOOSE, correlationBucketThreshold: 0.9, maxCorrelatedExposure: 0.3 },
    );
    const w = weights(r);
    expect(w.get('a')! + w.get('b')!).toBeCloseTo(0.3, 10);
    expect(w.get('a')! / w.get('b')!).toBeCloseTo(0.3 / 0.25, 10);
    expect(w.get('c')).toBeCloseTo(0.2, 12);
    expect(r.riskAdjustments.join(' ')).toContain('correlated bucket');
  });

  it('beta exposure scales weights when weighted beta exceeds cap', () => {
    const betas = new Map([['a', 1.5], ['b', 1.0]]);
    const r = buildPortfolio(
      scored([{ id: 'a', score: 0.3 }, { id: 'b', score: 0.2 }]),
      new Map(), looseRisk({ betas }), { ...LOOSE, maxBetaExposure: 0.4 },
    );
    const w = weights(r);
    expect(r.grossExposure).toBeCloseTo(0.5 * (0.4 / 0.65), 10);
    expect(w.get('a')! * 1.5 + w.get('b')! * 1.0).toBeCloseTo(0.4, 10);
    expect(w.get('a')! / w.get('b')!).toBeCloseTo(1.5, 10);
    expect(r.riskAdjustments.join(' ')).toContain('beta exposure');
  });

  it('null beta is excluded from calc and flagged fail-closed, not assumed', () => {
    const betas = new Map<string, number | null>([['a', null], ['b', 1.0]]);
    const r = buildPortfolio(
      scored([{ id: 'a', score: 0.3 }, { id: 'b', score: 0.2 }]),
      new Map(), looseRisk({ betas }), { ...LOOSE, maxBetaExposure: 0.4 },
    );
    expect(r.riskAdjustments.join(' ')).toContain('beta null for a');
    expect(r.positions.find((p) => p.alphaId === 'b')!.targetWeight).toBeCloseTo(0.2, 12);
  });

  it('turnover constraint scales delta vs current weights to cap', () => {
    const current = new Map([['a', 0.4]]);
    const r = buildPortfolio(
      scored([{ id: 'a', score: 0.25, direction: 'sell', confidence: 0.8 }]),
      current, looseRisk(), { ...LOOSE, maxTurnover: 0.3 },
    );
    expect(r.positions[0].targetWeight).toBeCloseTo(0.1, 10);
    expect(r.totalTurnover).toBeCloseTo(0.3, 10);
    expect(r.positions[0].turnover).toBeCloseTo(0.3, 10);
    expect(r.riskAdjustments.join(' ')).toContain('turnover constraint');
  });

  it('drawdown de-risk multiplies all weights beyond threshold; no-op below', () => {
    const ddCfg = { ...LOOSE, drawdownThreshold: 0.1, deRiskFactor: 0.5 };
    const r = buildPortfolio(
      scored([{ id: 'a', score: 0.4 }, { id: 'b', score: 0.2, direction: 'sell' }]),
      new Map(), looseRisk({ currentDrawdown: 0.15 }), ddCfg,
    );
    const w = weights(r);
    expect(w.get('a')).toBeCloseTo(0.2, 12);
    expect(w.get('b')).toBeCloseTo(-0.1, 12);
    expect(r.drawdownDeRisked).toBe(true);
    expect(r.riskAdjustments.join(' ')).toContain('drawdown de-risk');

    const calm = buildPortfolio(scored([{ id: 'a', score: 0.4 }]), new Map(), looseRisk({ currentDrawdown: 0.05 }), ddCfg);
    expect(calm.drawdownDeRisked).toBe(false);
    expect(calm.positions[0].targetWeight).toBeCloseTo(0.4, 12);
  });

  it('empty scoredAlphas -> empty positions, zero exposures, no error', () => {
    const r = buildPortfolio([], new Map(), looseRisk(), LOOSE);
    expect(r.positions).toEqual([]);
    expect(r.grossExposure).toBe(0);
    expect(r.netExposure).toBe(0);
    expect(r.totalTurnover).toBe(0);
    expect(r.riskAdjustments).toEqual([]);
    expect(r.drawdownDeRisked).toBe(false);
  });

  it('risk applied AFTER alpha: same scores, changed riskInputs -> different portfolio', () => {
    const alphas = scored([{ id: 'a', score: 0.4 }]);
    const cfg = { ...LOOSE, drawdownThreshold: 0.1 };
    const calm = buildPortfolio(alphas, new Map(), looseRisk(), cfg);
    const stressed = buildPortfolio(alphas, new Map(), looseRisk({ currentDrawdown: 0.5 }), cfg);
    expect(calm.positions[0].targetWeight).toBeCloseTo(0.4, 12);
    expect(stressed.positions[0].targetWeight).toBeCloseTo(0.2, 12);
    expect(calm.drawdownDeRisked).toBe(false);
    expect(stressed.drawdownDeRisked).toBe(true);
  });

  it('determinism: identical inputs produce identical output', () => {
    const alphas = scored([{ id: 'a', score: 0.3 }, { id: 'b', score: 0.2, direction: 'sell' }]);
    const current = new Map([['a', 0.1]]);
    const risk = looseRisk({ realizedVolatility: 0.08, currentDrawdown: 0.2 });
    const cfg = { ...LOOSE, targetVolatility: 0.03, drawdownThreshold: 0.1, maxGrossExposure: 0.6 };
    expect(buildPortfolio(alphas, current, risk, cfg)).toEqual(buildPortfolio(alphas, current, risk, cfg));
  });
});
