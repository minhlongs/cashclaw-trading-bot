// Alpha Research Report Generator — tests

import { describe, it, expect } from 'vitest';
import { generateResearchReport } from './generator';
import type { Experiment } from '@/forest/alpha/experiments/types';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { AttributionReport } from '@/forest/alpha/attribution/types';
import { RegimeLabel } from '@/tree/regime/types';

function makeExperiment(overrides: Partial<Experiment> = {}): Experiment {
  return {
    id: 'exp-1',
    hypothesis: 'momentum breakout',
    dataset: 'test',
    symbol: 'BTC/USDT',
    timeframe: '1h',
    featureSet: { names: ['rsi', 'macd'] },
    regimeFilter: [],
    entryRule: { type: 'close_above', params: {} },
    exitRule: { type: 'close_below', params: {} },
    positionSizing: { type: 'fixed', value: 0.01 },
    feeModel: { type: 'percentage', value: 0.001 },
    slippageModel: { type: 'fixed', value: 0 },
    trainPeriod: { start: 0, end: 100 },
    validationPeriod: { start: 101, end: 200 },
    testPeriod: { start: 201, end: 300 },
    configSnapshot: {},
    ...overrides,
  } as Experiment;
}

function makeEvaluation(overrides: Partial<EvaluationReport> = {}): EvaluationReport {
  return {
    experimentId: 'exp-1',
    symbol: 'BTC/USDT',
    timeframe: '1h',
    regime: 0,
    totalReturn: 0.15,
    netPnl: 1500,
    cagr: 0,
    winRate: 0.55,
    lossRate: 0.45,
    profitFactor: 1.4,
    expectancy: 0.02,
    sharpe: 0.6,
    sortino: 0.8,
    maxDrawdown: 0.12,
    avgTrade: 30,
    medianTrade: 20,
    numTrades: 50,
    turnover: 2,
    fees: 50,
    slippage: 10,
    exposure: 0.7,
    recoveryFactor: 1.5,
    byRegime: {},
    byMonth: {},
    byVolBucket: {},
    byDuration: { short: {}, medium: {}, long: {} },
    ...overrides,
  } as EvaluationReport;
}

function makeAttribution(): AttributionReport {
  return {
    ExperimentId: 'exp-1',
    attributions: [],
    TopContributor: 'rsi',
    WorstContributor: 'macd',
    diversificationScore: 0.53,
  };
}

describe('generateResearchReport', () => {
  it('returns a complete ResearchReport', () => {
    const report = generateResearchReport({
      experiment: makeExperiment(),
      evaluation: makeEvaluation(),
      baseline: null,
      attribution: makeAttribution(),
    });

    expect(report.experimentId).toBe('exp-1');
    expect(report.title).toContain('momentum breakout');
    expect(report.generatedAt).toBeTruthy();
    expect(report.summary.netPnl).toBe(1500);
    expect(report.evaluation).toBeDefined();
    expect(report.attribution).toBeDefined();
    expect(Object.keys(report.regimeAnalysis).length).toBeGreaterThan(0);
  });

  it('recommends live-trading warning when Sharpe < 0.5', () => {
    const report = generateResearchReport({
      experiment: makeExperiment(),
      evaluation: makeEvaluation({ sharpe: 0.3 }),
      baseline: null,
      attribution: makeAttribution(),
    });

    const liveRec = report.recommendations.find(
      (r) => r.includes('not viable for live'),
    );
    expect(liveRec).toBeTruthy();
  });

  it('recommends drawdown warning when maxDrawdown > 20%', () => {
    const report = generateResearchReport({
      experiment: makeExperiment(),
      evaluation: makeEvaluation({ maxDrawdown: 0.25 }),
      baseline: null,
      attribution: makeAttribution(),
    });

    const ddRec = report.recommendations.find((r) => r.includes('reduce position'));
    expect(ddRec).toBeTruthy();
  });

  it('recommends regime-conditional when only one regime is profitable', () => {
    const report = generateResearchReport({
      experiment: makeExperiment({
        regimePerformance: {
          [RegimeLabel.TREND_UP]: { regime: RegimeLabel.TREND_UP, sampleCount: 10, sharpe: 1, totalPnl: 500, winRate: 0.8 },
          [RegimeLabel.TREND_DOWN]: { regime: RegimeLabel.TREND_DOWN, sampleCount: 5, sharpe: 0, totalPnl: -100, winRate: 0.2 },
        } as unknown as import('@/forest/alpha/experiments/types').RegimePerformance,
      } as Partial<Experiment>),
      evaluation: makeEvaluation(),
      baseline: null,
      attribution: makeAttribution(),
    });

    const regimeRec = report.recommendations.find((r) =>
      r.includes('regime-conditional'),
    );
    expect(regimeRec).toBeTruthy();
  });

  it('computes vsBaseline delta when baseline provided', () => {
    const report = generateResearchReport({
      experiment: makeExperiment(),
      evaluation: makeEvaluation({ netPnl: 1500 }),
      baseline: { report: makeEvaluation({ netPnl: 1000 }) },
      attribution: makeAttribution(),
    });

    expect(report.summary.vsBaseline).toBe(500);
  });

  it('returns no recommendations when at least two regimes are profitable and metrics are healthy', () => {
    const report = generateResearchReport({
      experiment: makeExperiment({
        regimePerformance: {
          [RegimeLabel.TREND_UP]: { regime: RegimeLabel.TREND_UP, sampleCount: 10, sharpe: 1, totalPnl: 200, winRate: 0.6 },
          [RegimeLabel.TREND_DOWN]: { regime: RegimeLabel.TREND_DOWN, sampleCount: 5, sharpe: 0, totalPnl: 25, winRate: 0.5 },
          [RegimeLabel.RANGE]: { regime: RegimeLabel.RANGE, sampleCount: 8, sharpe: 1, totalPnl: 80, winRate: 0.55 },
        } as unknown as import('@/forest/alpha/experiments/types').RegimePerformance,
      } as Partial<Experiment>),
      evaluation: makeEvaluation({ sharpe: 1.2, maxDrawdown: 0.1 }),
      baseline: null,
      attribution: makeAttribution(),
    });

    expect(report.recommendations.length).toBe(0);
  });
});