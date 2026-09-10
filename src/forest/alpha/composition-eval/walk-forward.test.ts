import { describe, it, expect } from 'vitest';
import type { ComposedAlpha, CompositionConfig } from '@/tree/alpha/composition';
import type { PortfolioConfig, RiskInputs } from '@/tree/alpha/portfolio';
import { RegimeLabel } from '@/tree/regime/types';
import { assessWalkForwardConsistency } from '@/forest/alpha/multiple-testing';
import { runCompositionWalkForward } from './walk-forward';
import { toWalkForwardShim } from './walk-forward-shim';
import type { CompositionEvalConfig, CompositionWalkForwardInput } from './types';

function alpha(t: number, overrides: Partial<ComposedAlpha> = {}): ComposedAlpha {
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
    timestamp: t,
    ...overrides,
  };
}

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

function risk(): RiskInputs {
  return {
    realizedVolatility: 0.5,
    correlationMatrix: new Map(),
    betas: new Map(),
    currentDrawdown: 0.02,
  };
}

function evalConfig(overrides: Partial<CompositionEvalConfig> = {}): CompositionEvalConfig {
  return {
    compositionConfig: COMPOSITION_CONFIG,
    portfolioConfig: PORTFOLIO_CONFIG,
    experimentId: 'wf-test',
    timeframe: '1h',
    periodsPerYear: 8760,
    costBps: 10,
    ...overrides,
  };
}

function createFixtures(n = 60, returnFn = (_i: number) => 0.01) {
  const alphasAtEachT = new Map<number, readonly ComposedAlpha[]>();
  const returnSeriesAtEachT = new Map<number, number>();
  const riskInputsAtEachT = new Map<number, RiskInputs>();
  const timestamps: number[] = [];

  for (let i = 0; i < n; i++) {
    const t = 1000 + i * 3600;
    timestamps.push(t);
    alphasAtEachT.set(t, [alpha(t)]);
    returnSeriesAtEachT.set(t, returnFn(i));
    riskInputsAtEachT.set(t, risk());
  }

  return { alphasAtEachT, returnSeriesAtEachT, riskInputsAtEachT, timestamps };
}

describe('runCompositionWalkForward', () => {
  it('runs rolling walk-forward and partitions windows', () => {
    const { alphasAtEachT, returnSeriesAtEachT, riskInputsAtEachT, timestamps } = createFixtures(60);

    const input: CompositionWalkForwardInput = {
      alphasAtEachT,
      returnSeriesAtEachT,
      riskInputsAtEachT,
      timestamps,
      config: evalConfig(),
      windowConfig: {
        trainBars: 20,
        validateBars: 10,
        testBars: 10,
        stepBars: 10,
      },
      mode: 'rolling',
    };

    const result = runCompositionWalkForward(input);

    // Total 60 bars, window size 40, step 10 -> slices at 0, 10, 20 -> 3 windows
    expect(result.windows).toHaveLength(3);
    expect(result.windows[0].bounds.trainStart).toBe(0);
    expect(result.windows[0].bounds.trainEnd).toBe(20);
    expect(result.windows[0].bounds.testStart).toBe(30);
    expect(result.windows[0].bounds.testEnd).toBe(40);

    expect(result.windows[1].bounds.trainStart).toBe(10);
    expect(result.windows[1].bounds.trainEnd).toBe(30);
    expect(result.windows[1].bounds.testStart).toBe(40);
    expect(result.windows[1].bounds.testEnd).toBe(50);

    expect(result.windows[2].bounds.trainStart).toBe(20);
    expect(result.windows[2].bounds.trainEnd).toBe(40);
    expect(result.windows[2].bounds.testStart).toBe(50);
    expect(result.windows[2].bounds.testEnd).toBe(60);

    // Stitched OOS periods: 3 test windows * 10 bars = 30 periods
    expect(result.stitched.periods).toHaveLength(30);
    expect(result.stitched.equityCurve).toHaveLength(31);
    expect(result.summaryStats.totalWindows).toBe(3);
    expect(result.summaryStats.positiveOosFraction).toBeGreaterThan(0);
  });

  it('runs expanding walk-forward where trainStart stays at 0', () => {
    const { alphasAtEachT, returnSeriesAtEachT, riskInputsAtEachT } = createFixtures(50);

    const input: CompositionWalkForwardInput = {
      alphasAtEachT,
      returnSeriesAtEachT,
      riskInputsAtEachT,
      config: evalConfig(),
      windowConfig: {
        trainBars: 15,
        validateBars: 5,
        testBars: 10,
        stepBars: 10,
      },
      mode: 'expanding',
    };

    const result = runCompositionWalkForward(input);

    expect(result.windows.length).toBeGreaterThanOrEqual(2);
    for (const w of result.windows) {
      expect(w.bounds.trainStart).toBe(0);
    }
    expect(result.windows[1].bounds.trainEnd).toBeGreaterThan(result.windows[0].bounds.trainEnd);
  });

  it('throws when candles count is insufficient for windowConfig', () => {
    const { alphasAtEachT, returnSeriesAtEachT, riskInputsAtEachT } = createFixtures(15);

    const input: CompositionWalkForwardInput = {
      alphasAtEachT,
      returnSeriesAtEachT,
      riskInputsAtEachT,
      config: evalConfig(),
      windowConfig: {
        trainBars: 20,
        validateBars: 10,
        testBars: 10,
        stepBars: 10,
      },
      mode: 'rolling',
    };

    expect(() => runCompositionWalkForward(input)).toThrow(/Not enough candles/);
  });
});

describe('toWalkForwardShim & assessWalkForwardConsistency', () => {
  it('converts composition walk-forward result to shim compatible with consistency checker', () => {
    const { alphasAtEachT, returnSeriesAtEachT, riskInputsAtEachT } = createFixtures(60, () => 0.02);

    const input: CompositionWalkForwardInput = {
      alphasAtEachT,
      returnSeriesAtEachT,
      riskInputsAtEachT,
      config: evalConfig(),
      windowConfig: {
        trainBars: 20,
        validateBars: 10,
        testBars: 10,
        stepBars: 10,
      },
      mode: 'rolling',
    };

    const compResult = runCompositionWalkForward(input);
    const shim = toWalkForwardShim(compResult);

    expect(shim.windows).toHaveLength(3);
    expect(shim.aggregated.summaryStats.totalWindows).toBe(3);
    expect(shim.windows[0].testMetrics.total_pnl).toBeGreaterThan(0);

    const verdict = assessWalkForwardConsistency(shim, {
      minPositiveFraction: 0.5,
      maxSignFlips: 2,
    });

    expect(verdict.positiveFraction).toBe(1);
    expect(verdict.signFlips).toBe(0);
    expect(verdict.consistent).toBe(true);
  });

  it('throws on empty windows in shim conversion', () => {
    const emptyResult = {
      windows: [],
      stitched: {
        periods: [],
        equityCurve: [1],
        totalReturn: 0,
        annualizedSharpe: null,
        annualizedSortino: null,
        maxDrawdownPct: 0,
        totalTurnover: 0,
        totalCosts: 0,
      },
      summaryStats: {
        totalWindows: 0,
        avgInSampleSharpe: 0,
        avgOutSampleSharpe: 0,
        degradationRatio: 0,
        positiveOosFraction: 0,
      },
    };

    expect(() => toWalkForwardShim(emptyResult)).toThrow(/no windows/);
  });
});
