// Multiple-Testing Defense — Survival Evaluation Tests
// Class falsification per plan §4 Step e: each safeguard alone must be able
// to falsify a job, and the conjunction must still allow a genuinely
// consistent strategy to survive.

import { describe, expect, it } from 'vitest';
import { evaluateSurvival } from './evaluate';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { BacktestResult } from '@/forest/backtest/types';
import type {
  SummaryStats,
  WalkForwardResult,
  WalkForwardWindow,
} from '@/forest/backtest/walkforward';
import { RegimeLabel } from '@/tree/regime/types';
import type { SurvivalEvaluationInput } from './types';

// ── Helpers ──────────────────────────────────────────────

function makeReport(overrides: Partial<EvaluationReport> = {}): EvaluationReport {
  return {
    experimentId: 'test-exp',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    regime: RegimeLabel.RANGE,
    totalReturn: 100,
    netPnl: 100,
    cagr: 0.5,
    winRate: 0.55,
    lossRate: 0.45,
    profitFactor: 1.5,
    expectancy: 0.02,
    sharpe: 1.2,
    sortino: 1.5,
    maxDrawdown: 0.1,
    avgTrade: 0.5,
    medianTrade: 0.4,
    numTrades: 200,
    turnover: 2,
    fees: 10,
    slippage: 5,
    exposure: 0.8,
    recoveryFactor: 2,
    byRegime: {} as EvaluationReport['byRegime'],
    byMonth: {},
    byVolBucket: {},
    byDuration: { short: {}, medium: {}, long: {} },
    ...overrides,
  };
}

function makeBacktestResult(overrides: Partial<BacktestResult> = {}): BacktestResult {
  return {
    id: 'test',
    bot_id: 'bot-1',
    strategy: 'test-strat',
    pair: 'BTCUSDT',
    exchange: 'binance',
    start_date: 0,
    end_date: 1000,
    total_trades: 10,
    win_count: 6,
    loss_count: 4,
    win_rate: 0.6,
    total_pnl: 100,
    max_drawdown: 50,
    sharpe_ratio: 1.5,
    params_json: '{}',
    equity_curve_json: [],
    trades_json: [],
    created_at: 0,
    ...overrides,
  };
}

function makeWindow(testMetrics: BacktestResult, index: number): WalkForwardWindow {
  return {
    trainStart: index * 200,
    trainEnd: index * 200 + 100,
    validateStart: index * 200 + 100,
    validateEnd: index * 200 + 150,
    testStart: index * 200 + 150,
    testEnd: index * 200 + 200,
    trainMetrics: makeBacktestResult(),
    validateMetrics: makeBacktestResult(),
    testMetrics,
    regimeAtTestStart: RegimeLabel.RANGE,
  };
}

function makeWalkForward(sharpes: readonly number[]): WalkForwardResult {
  const windows = sharpes.map((s, i) =>
    makeWindow(makeBacktestResult({ sharpe_ratio: s, total_pnl: s * 100 }), i),
  );
  const n = windows.length;
  const avgIn = 1.5;
  const avgOut = sharpes.reduce((sum, s) => sum + s, 0) / n;
  const summaryStats: SummaryStats = {
    totalWindows: n,
    avgInSampleSharpe: avgIn,
    avgOutSampleSharpe: avgOut,
    degradationRatio: avgOut / avgIn,
    regimeDiversity: 1,
  };
  return {
    windows,
    aggregated: {
      inSample: makeBacktestResult(),
      validation: makeBacktestResult(),
      outOfSample: makeBacktestResult(),
      byRegime: {} as WalkForwardResult['aggregated']['byRegime'],
      summaryStats,
    },
  };
}

/** All-positive OOS windows → walk-forward consistency passes. */
const CONSISTENT_WF = makeWalkForward([1.0, 1.2, 1.1, 1.3]);

/**
 * Both IS-best configs (highest mean across windows) collapse in the final
 * OOS window, finishing below the median final-window performance → pbo = 1.
 */
const HIGH_PBO_MATRIX: readonly (readonly number[])[] = [
  [2.0, 2.0, -2.0],
  [1.5, 1.5, -1.0],
  [0.5, 0.5, 0.5],
  [0.4, 0.4, 0.4],
];

/** IS ranking survives OOS → pbo = 0. */
const LOW_PBO_MATRIX: readonly (readonly number[])[] = [
  [1.0, 1.0, 1.0],
  [0.9, 0.9, 0.9],
  [0.8, 0.8, 0.8],
  [0.7, 0.7, 0.7],
];

/**
 * Baseline input where every safeguard passes. Each falsification test
 * overrides exactly one field so the failing check is isolated.
 */
function makeInput(overrides: Partial<SurvivalEvaluationInput> = {}): SurvivalEvaluationInput {
  return {
    tradeReturns: Array.from({ length: 60 }, (_, i) => 0.02 + (i % 5) * 0.001),
    strategyReturns: Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 0.03 : -0.01)),
    entrySignals: Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 1 : -1)),
    walkForward: CONSISTENT_WF,
    configMatrix: LOW_PBO_MATRIX,
    crossAssetReports: [
      makeReport({ symbol: 'BTCUSDT', expectancy: 0.02 }),
      makeReport({ symbol: 'ETHUSDT', expectancy: 0.015 }),
      makeReport({ symbol: 'SOLUSDT', expectancy: 0.01 }),
    ],
    baselineReport: makeReport({ expectancy: 0.001 }),
    report: makeReport({ expectancy: 0.02 }),
    bootstrap: { iterations: 200, confidence: 0.95, seed: 42 },
    permutation: { iterations: 500, seed: 42 },
    walkForwardOptions: { minPositiveFraction: 0.75, maxSignFlips: 1 },
    crossAssetOptions: { minPositiveFraction: 0.6, minAssets: 3 },
    maxPbo: 0.5,
    ...overrides,
  };
}

describe('evaluateSurvival', () => {
  describe('class falsification — one failed check falsifies', () => {
    it('exactly 1 lucky OOS window of N → falsified', () => {
      const input = makeInput({ walkForward: makeWalkForward([1.5, -0.8, -0.6, -0.9]) });
      const result = evaluateSurvival(input);
      expect(result.verdict).toBe('falsified');
      expect(result.reasons.some((r) => r.startsWith('walk_forward_consistency:'))).toBe(true);
    });

    it('strategy indistinguishable from random_entry (edge <= 0) → falsified', () => {
      const input = makeInput({
        report: makeReport({ expectancy: 0.001 }),
        baselineReport: makeReport({ expectancy: 0.001 }),
      });
      const result = evaluateSurvival(input);
      expect(result.verdict).toBe('falsified');
      expect(result.reasons.some((r) => r.startsWith('random_entry:'))).toBe(true);
    });

    it('high-PBO config matrix → falsified', () => {
      const input = makeInput({ configMatrix: HIGH_PBO_MATRIX });
      const result = evaluateSurvival(input);
      expect(result.verdict).toBe('falsified');
      expect(result.reasons.some((r) => r.startsWith('pbo_proxy:'))).toBe(true);
    });

    it('cross-asset: 1 asset passes, rest fail → falsified', () => {
      const input = makeInput({
        crossAssetReports: [
          makeReport({ symbol: 'BTCUSDT', expectancy: 0.02 }),
          makeReport({ symbol: 'ETHUSDT', expectancy: -0.01 }),
          makeReport({ symbol: 'SOLUSDT', expectancy: -0.02 }),
        ],
      });
      const result = evaluateSurvival(input);
      expect(result.verdict).toBe('falsified');
      expect(result.reasons.some((r) => r.startsWith('cross_asset_consistency:'))).toBe(true);
    });

    it('bootstrap CI containing 0 → falsified', () => {
      const input = makeInput({
        tradeReturns: Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 0.03 : -0.028)),
      });
      const result = evaluateSurvival(input);
      expect(result.verdict).toBe('falsified');
      expect(result.reasons.some((r) => r.startsWith('bootstrap_ci:'))).toBe(true);
    });
  });

  describe('happy path — conjunction is not too strict', () => {
    it('all checks pass → survived with empty reasons', () => {
      const result = evaluateSurvival(makeInput());
      expect(result.verdict).toBe('survived');
      expect(result.reasons).toHaveLength(0);
    });
  });

  describe('reasons[]', () => {
    it('collects every failed check when several safeguards fail at once', () => {
      const input = makeInput({
        tradeReturns: Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 0.03 : -0.028)),
        walkForward: makeWalkForward([1.5, -0.8, -0.6, -0.9]),
        configMatrix: HIGH_PBO_MATRIX,
      });
      const result = evaluateSurvival(input);
      expect(result.verdict).toBe('falsified');
      expect(result.reasons.some((r) => r.startsWith('bootstrap_ci:'))).toBe(true);
      expect(result.reasons.some((r) => r.startsWith('walk_forward_consistency:'))).toBe(true);
      expect(result.reasons.some((r) => r.startsWith('pbo_proxy:'))).toBe(true);
    });

    it('every falsified verdict carries at least one reason', () => {
      const failingInputs = [
        makeInput({ walkForward: makeWalkForward([1.5, -0.8, -0.6, -0.9]) }),
        makeInput({
          report: makeReport({ expectancy: 0.001 }),
          baselineReport: makeReport({ expectancy: 0.001 }),
        }),
        makeInput({ configMatrix: HIGH_PBO_MATRIX }),
      ];
      for (const input of failingInputs) {
        const result = evaluateSurvival(input);
        expect(result.verdict).toBe('falsified');
        expect(result.reasons.length).toBeGreaterThan(0);
      }
    });
  });
});
