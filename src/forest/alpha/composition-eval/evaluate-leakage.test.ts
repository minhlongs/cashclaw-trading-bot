// Leakage isolation tests (escrow #1): each decision time consumed independently.
import { describe, it, expect } from 'vitest';
import type { ComposedAlpha, CompositionConfig } from '@/tree/alpha/composition';
import type { PortfolioConfig, RiskInputs } from '@/tree/alpha/portfolio';
import { RegimeLabel } from '@/tree/regime/types';
import { evaluateComposition } from './evaluate';
import type { CompositionEvalConfig } from './types';

const COMPOSITION_CONFIG: CompositionConfig = {
  weights: {
    returnWeight: 1.0,
    costWeight: 1.0,
    riskPenaltyWeight: 0.05,
    turnoverPenaltyWeight: 0.02,
    confidenceWeight: 0.2,
  },
  minNetEdge: 0.001,
  maxTurnover: 2.0,
};

const PORTFOLIO_CONFIG: PortfolioConfig = {
  targetVolatility: 0.15,
  maxPositionWeight: 0.50,
  maxGrossExposure: 1.20,
  maxNetExposure: 1.00,
  maxCorrelatedExposure: 0.80,
  correlationBucketThreshold: 0.90,
  maxBetaExposure: 0.50,
  maxTurnover: 1.50,
  drawdownThreshold: 0.10,
  deRiskFactor: 0.50,
};

function evalConfig(): CompositionEvalConfig {
  return {
    compositionConfig: COMPOSITION_CONFIG,
    portfolioConfig: PORTFOLIO_CONFIG,
    experimentId: 'leakage-test',
    timeframe: '1h',
    periodsPerYear: 8760,
    costBps: 10,
  };
}
function alpha(id: string, ts: number): ComposedAlpha {
  return {
    alphaId: id,
    direction: 'buy',
    confidence: 0.8,
    expectedReturn: 0.10,
    expectedCost: 0.002,
    expectedTurnover: 0.5,
    regime: RegimeLabel.RANGE,
    horizon: '1d',
    provenance: 'test',
    featureDependencies: [],
    timestamp: ts,
  };
}

function risk(): RiskInputs {
  return {
    realizedVolatility: 0.5,
    correlationMatrix: new Map(),
    betas: new Map(),
    currentDrawdown: 0.02,
  };
}

function baseAlphas(): Map<number, readonly ComposedAlpha[]> {
  return new Map([
    [100, [alpha('A', 100)]],
    [200, [alpha('A', 200), alpha('B', 200)]],
    [300, [alpha('B', 300)]],
  ]);
}

function baseReturns(): Map<number, number> {
  return new Map([[100, 0.05], [200, 0.03], [300, -0.04]]);
}

function baseRisks(): Map<number, RiskInputs> {
  return new Map([[100, risk()], [200, risk()], [300, risk()]]);
}

describe('evaluateComposition leakage isolation (escrow #1)', () => {
  it('mutate-future: changing return at one key leaves ALL prior periods byte-identical', () => {
    const cfg = evalConfig();
    const baseline = evaluateComposition(baseAlphas(), baseReturns(), baseRisks(), cfg);

    // Mutate ONLY the last key's return (t=300). Periods 0 and 1 must be
    // untouched — the seam must not feed future returns backward.
    const mutated = new Map(baseReturns());
    mutated.set(300, 0.99);
    const after = evaluateComposition(baseAlphas(), mutated, baseRisks(), cfg);

    expect(after.periods).toHaveLength(baseline.periods.length);
    for (let k = 0; k < baseline.periods.length - 1; k++) {
      expect(JSON.stringify(after.periods[k])).toBe(
        JSON.stringify(baseline.periods[k]),
      );
    }
    expect(after.periods[2].grossReturn).not.toBe(baseline.periods[2].grossReturn);
  });

  it('shift-boundary: moving alphas one key later changes output at the boundary only', () => {
    const cfg = evalConfig();
    const baseline = evaluateComposition(baseAlphas(), baseReturns(), baseRisks(), cfg);

    // Shift t=100 alphas to t=200 (merge with existing), leaving t=100 empty.
    const shiftedAlphas = new Map<number, readonly ComposedAlpha[]>([
      [100, []],
      [200, [...(baseAlphas().get(200) ?? []), alpha('A', 200)]],
      [300, baseAlphas().get(300) ?? []],
    ]);
    const shifted = evaluateComposition(shiftedAlphas, baseReturns(), baseRisks(), cfg);

    // Boundary period (t=100) differs: baseline has a position, shifted is flat.
    expect(baseline.periods[0].positions.length).toBeGreaterThan(0);
    expect(shifted.periods[0].positions).toHaveLength(0);
    expect(shifted.periods[0].netReturn).toBe(0);
    expect(shifted.periods[0].scoredAlphas).toHaveLength(0);
    // Later periods still execute (t=200 has merged alphas).
    expect(shifted.periods[1].positions.length).toBeGreaterThan(0);
  });

  it('determinism: same inputs produce byte-identical output', () => {
    const cfg = evalConfig();
    const r1 = evaluateComposition(baseAlphas(), baseReturns(), baseRisks(), cfg);
    const r2 = evaluateComposition(baseAlphas(), baseReturns(), baseRisks(), cfg);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it('fail-closed: missing return key throws, never silently skips', () => {
    const returns = baseReturns();
    returns.delete(200);
    expect(() =>
      evaluateComposition(baseAlphas(), returns, baseRisks(), evalConfig()),
    ).toThrow(/missing return for decision time 200/);
  });

  it('fail-closed: missing riskInputs key throws, never silently skips', () => {
    const risks = baseRisks();
    risks.delete(300);
    expect(() =>
      evaluateComposition(baseAlphas(), baseReturns(), risks, evalConfig()),
    ).toThrow(/missing riskInputs for decision time 300/);
  });

  it('empty alphas at a decision time → flat period, zero cost, zero turnover', () => {
    const alphas = new Map<number, readonly ComposedAlpha[]>([
      [100, []],
      [200, [alpha('A', 200)]],
    ]);
    const returns = new Map<number, number>([[100, 0.05], [200, 0.03]]);
    const risks = new Map<number, RiskInputs>([[100, risk()], [200, risk()]]);

    const result = evaluateComposition(alphas, returns, risks, evalConfig());

    expect(result.periods[0]).toMatchObject({
      timestamp: 100,
      positions: [],
      grossReturn: 0,
      costPct: 0,
      netReturn: 0,
      turnover: 0,
    });
    // Flat period contributes nothing to equity.
    expect(result.equityCurve[1]).toBeCloseTo(1, 12);
    // Next period builds from empty previous weights (full turnover charged).
    expect(result.periods[1].turnover).toBeGreaterThan(0);
  });

  it('populated alphas all rejected → flat period, equity unchanged, prevWeights stickiness', () => {
    function rejectedAlpha(id: string, ts: number): ComposedAlpha {
      return { ...alpha(id, ts), expectedReturn: NaN };
    }
    const cfg = evalConfig();
    const alphas = new Map<number, readonly ComposedAlpha[]>([
      [100, [alpha('A', 100)]],
      [200, [rejectedAlpha('X', 200), rejectedAlpha('Y', 200)]],
      [300, [alpha('C', 300)]],
    ]);
    const returns = new Map<number, number>([[100, 0.05], [200, 0.03], [300, 0.04]]);
    const risks = new Map<number, RiskInputs>([[100, risk()], [200, risk()], [300, risk()]]);
    const result = evaluateComposition(alphas, returns, risks, cfg);
    // t=200: populated but all rejected → flat.
    const p1 = result.periods[1];
    expect(p1.timestamp).toBe(200);
    expect(p1.positions).toHaveLength(0);
    expect(p1.scoredAlphas).toHaveLength(0);
    expect(p1.grossReturn).toBe(0);
    expect(p1.netReturn).toBe(0);
    expect(p1.turnover).toBe(0);
    expect(p1.costPct).toBe(0);
    expect(result.equityCurve[2]).toBeCloseTo(result.equityCurve[1], 12);
    // Stickiness: t=300 turnover reflects jump from t=100 weights (t=200 kept prevWeights intact).
    expect(result.periods[0].turnover).toBeGreaterThan(0);
    expect(result.periods[2].turnover).toBeGreaterThan(0);
  });
});
