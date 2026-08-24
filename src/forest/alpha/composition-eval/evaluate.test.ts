import { describe, it, expect } from 'vitest';
import type { ComposedAlpha, CompositionConfig } from '@/tree/alpha/composition';
import type { PortfolioConfig, RiskInputs } from '@/tree/alpha/portfolio';
import { RegimeLabel } from '@/tree/regime/types';
import { evaluateComposition } from './evaluate';
import type { CompositionEvalConfig } from './types';

function alpha(overrides: Partial<ComposedAlpha> = {}): ComposedAlpha {
  return {
    alphaId: 'A',
    direction: 'buy',
    confidence: 0.8,
    expectedReturn: 0.10,
    expectedCost: 0.002,
    expectedTurnover: 0.5,
    regime: RegimeLabel.RANGE,
    horizon: '1d',
    provenance: 'test',
    featureDependencies: [],
    timestamp: 100,
    ...overrides,
  };
}

// Scoring weights chosen so fixture alphas pass the gates:
// net_edge(STRONG-ish default alpha) = 0.8*0.10 - 0.002 - 0.05*0.2 - 0.02*0.5 = 0.058.
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

function risk(
  overrides: Partial<RiskInputs> = {},
): RiskInputs {
  return {
    realizedVolatility: 0.5,
    correlationMatrix: new Map(),
    betas: new Map(),
    currentDrawdown: 0.02,
    ...overrides,
  };
}

function evalConfig(overrides: Partial<CompositionEvalConfig> = {}): CompositionEvalConfig {
  return {
    compositionConfig: COMPOSITION_CONFIG,
    portfolioConfig: PORTFOLIO_CONFIG,
    experimentId: 'test-exp',
    timeframe: '1h',
    periodsPerYear: 8760,
    costBps: 10,
    ...overrides,
  };
}

describe('evaluateComposition', () => {
  it('single alpha single period: weighted return matches', () => {
    const alphas = new Map<number, readonly ComposedAlpha[]>([
      [100, [alpha({ alphaId: 'A', confidence: 0.9, expectedReturn: 0.12 })]],
    ]);
    const returns = new Map<number, number>([[100, 0.05]]);
    const risks = new Map<number, RiskInputs>([[100, risk()]]);

    const result = evaluateComposition(alphas, returns, risks, evalConfig());

    expect(result.periods).toHaveLength(1);
    expect(result.equityCurve).toHaveLength(2);
    expect(result.periods[0].grossReturn).toBeGreaterThan(0);
    expect(result.periods[0].netReturn).toBeLessThanOrEqual(result.periods[0].grossReturn);
    expect(result.periods[0].positions.length).toBeGreaterThan(0);
  });

  it('deterministic: same inputs produce identical results', () => {
    const alphas = new Map<number, readonly ComposedAlpha[]>([
      [100, [alpha({ alphaId: 'A' })]],
      [200, [alpha({ alphaId: 'A', timestamp: 200 })]],
    ]);
    const returns = new Map<number, number>([[100, 0.05], [200, -0.02]]);
    const risks = new Map<number, RiskInputs>([[100, risk()], [200, risk()]]);
    const cfg = evalConfig();

    const r1 = evaluateComposition(alphas, returns, risks, cfg);
    const r2 = evaluateComposition(alphas, returns, risks, cfg);

    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it('equity curve starts at 1.0 and compounds correctly', () => {
    const alphas = new Map<number, readonly ComposedAlpha[]>([
      [100, [alpha({ alphaId: 'A' })]],
      [200, [alpha({ alphaId: 'A', timestamp: 200 })]],
    ]);
    const returns = new Map<number, number>([[100, 0.04], [200, 0.03]]);
    const risks = new Map<number, RiskInputs>([[100, risk()], [200, risk()]]);
    const cfg = evalConfig({ costBps: 0 });

    const result = evaluateComposition(alphas, returns, risks, cfg);

    expect(result.equityCurve[0]).toBe(1);
    expect(result.equityCurve).toHaveLength(3);

    // No costs, netReturn = grossReturn = weight * return
    const r0 = result.periods[0].netReturn;
    const r1 = result.periods[1].netReturn;
    expect(result.equityCurve[1]).toBeCloseTo(1 + r0, 12);
    expect(result.equityCurve[2]).toBeCloseTo((1 + r0) * (1 + r1), 12);
    expect(result.totalReturn).toBeCloseTo(result.equityCurve[2] - 1, 12);
  });

  it('cost attribution: total costs equals sum of per-period costs', () => {
    const alphas = new Map<number, readonly ComposedAlpha[]>([
      [100, [alpha({ alphaId: 'A' })]],
      [200, [alpha({ alphaId: 'A', timestamp: 200 })]],
    ]);
    const returns = new Map<number, number>([[100, 0.05], [200, -0.02]]);
    const risks = new Map<number, RiskInputs>([[100, risk()], [200, risk()]]);

    const result = evaluateComposition(alphas, returns, risks, evalConfig());

    const sumCosts = result.periods.reduce((acc, p) => acc + p.costPct, 0);
    expect(Math.abs(sumCosts - result.totalCosts)).toBeLessThan(1e-12);
  });

  it('costBps override takes priority over stressMode', () => {
    const alphas = new Map<number, readonly ComposedAlpha[]>([
      [100, [alpha({ alphaId: 'A' })]],
    ]);
    const returns = new Map<number, number>([[100, 0.05]]);
    const risks = new Map<number, RiskInputs>([[100, risk()]]);

    const withBps = evaluateComposition(alphas, returns, risks, evalConfig({ costBps: 10 }));
    const noBps = evaluateComposition(alphas, returns, risks, evalConfig({ costBps: undefined, stressMode: 'extreme' }));

    // costPct = turnover × costFraction; verify the resolved fractions.
    const bpsFraction = withBps.periods[0].costPct / withBps.periods[0].turnover;
    const extremeFraction = noBps.periods[0].costPct / noBps.periods[0].turnover;
    expect(bpsFraction).toBeCloseTo(10 / 10_000, 12);
    expect(extremeFraction).toBeCloseTo(0.01, 12);
    expect(withBps.periods[0].costPct).toBeLessThan(noBps.periods[0].costPct);
  });

  it('higher-score alpha receives larger weight', () => {
    const alphas = new Map<number, readonly ComposedAlpha[]>([
      [100, [
        alpha({ alphaId: 'STRONG', expectedReturn: 0.20, confidence: 0.9 }),
        alpha({ alphaId: 'WEAK', expectedReturn: 0.06, confidence: 0.6, expectedTurnover: 0.4 }),
      ]],
    ]);
    const returns = new Map<number, number>([[100, 0.05]]);
    const risks = new Map<number, RiskInputs>([[100, risk()]]);

    const result = evaluateComposition(alphas, returns, risks, evalConfig());

    const positions = result.periods[0].positions;
    const strongW = positions.find((p) => p.alphaId === 'STRONG')?.weight ?? 0;
    const weakW = positions.find((p) => p.alphaId === 'WEAK')?.weight ?? 0;
    expect(Math.abs(strongW)).toBeGreaterThan(Math.abs(weakW));
  });

  it('drawdown de-risk flow: riskInputs affect weights', () => {
    const alphas = new Map<number, readonly ComposedAlpha[]>([
      [100, [alpha({ alphaId: 'A' })]],
    ]);
    const returns = new Map<number, number>([[100, 0.05]]);
    const risksNormal = new Map<number, RiskInputs>([[100, risk({ currentDrawdown: 0.02 })]]);
    const risksDeep = new Map<number, RiskInputs>([[100, risk({ currentDrawdown: 0.15 })]]);

    const normal = evaluateComposition(alphas, returns, risksNormal, evalConfig());
    const derisked = evaluateComposition(alphas, returns, risksDeep, evalConfig());

    const normalWeight = normal.periods[0].positions[0]?.weight ?? 0;
    const deriskedWeight = derisked.periods[0].positions[0]?.weight ?? 0;
    expect(Math.abs(deriskedWeight)).toBeLessThan(Math.abs(normalWeight));
  });
});
