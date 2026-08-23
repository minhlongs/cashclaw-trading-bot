// Multiple-Testing Defense — Walk-Forward Consistency Tests
// Covers: consumes real WalkForwardResult shape (windows + aggregated.summaryStats.degradationRatio);
// 1 positive window out of N → consistent:false; all/most positive → consistent:true; sign flips counted correctly

import { describe, expect, it } from 'vitest';
import { assessWalkForwardConsistency } from './walk-forward-consistency';
import type { WalkForwardResult, WalkForwardWindow, SummaryStats } from '@/forest/backtest/walkforward';
import type { BacktestResult } from '@/forest/backtest/types';
import { RegimeLabel } from '@/tree/regime/types';

// ── Helpers ──────────────────────────────────────────────
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

function makeWalkForwardWindow(overrides: Partial<WalkForwardWindow> = {}): WalkForwardWindow {
  const base = makeBacktestResult();
  return {
    trainStart: 0,
    trainEnd: 100,
    validateStart: 100,
    validateEnd: 150,
    testStart: 150,
    testEnd: 200,
    trainMetrics: base,
    validateMetrics: base,
    testMetrics: base,
    regimeAtTestStart: RegimeLabel.RANGE,
    ...overrides,
  };
}

function makeWalkForwardResult(
  testMetrics: BacktestResult[],
  overrides: Partial<WalkForwardResult> = {},
): WalkForwardResult {
  const windows: WalkForwardWindow[] = testMetrics.map((tm, i) =>
    makeWalkForwardWindow({
      testMetrics: tm,
      trainStart: i * 200,
      trainEnd: i * 200 + 100,
      validateStart: i * 200 + 100,
      validateEnd: i * 200 + 150,
      testStart: i * 200 + 150,
      testEnd: i * 200 + 200,
    }),
  );

  const n = windows.length;
  const avgInSampleSharpe = windows.reduce((sum, w) => sum + (w.trainMetrics.sharpe_ratio ?? 0), 0) / n;
  const avgOutSampleSharpe = windows.reduce((sum, w) => sum + (w.testMetrics.sharpe_ratio ?? 0), 0) / n;

  const summaryStats: SummaryStats = {
    totalWindows: n,
    avgInSampleSharpe,
    avgOutSampleSharpe,
    degradationRatio: avgInSampleSharpe !== 0 ? avgOutSampleSharpe / avgInSampleSharpe : 0,
    regimeDiversity: 1,
  };

  return {
    windows,
    aggregated: {
      inSample: makeBacktestResult(),
      validation: makeBacktestResult(),
      outOfSample: makeBacktestResult(),
      byRegime: {} as Record<RegimeLabel, Omit<BacktestResult, 'id' | 'bot_id' | 'strategy' | 'pair' | 'exchange'>>,
      summaryStats,
    },
    ...overrides,
  };
}

describe('assessWalkForwardConsistency', () => {
  const baseOptions = {
    minPositiveFraction: 0.5,
    maxSignFlips: 2,
  };

  describe('happy path', () => {
    it('all windows positive → consistent:true', () => {
      const testMetrics = Array.from({ length: 5 }, (_, i) =>
        makeBacktestResult({ sharpe_ratio: 1.0 + i * 0.1, total_pnl: 100 + i * 10 }),
      );
      const wf = makeWalkForwardResult(testMetrics);
      const result = assessWalkForwardConsistency(wf, baseOptions);
      expect(result.positiveFraction).toBe(1);
      expect(result.signFlips).toBe(0);
      expect(result.consistent).toBe(true);
    });

    it('most windows positive → consistent:true', () => {
      const testMetrics = [
        makeBacktestResult({ sharpe_ratio: 1.5, total_pnl: 100 }),
        makeBacktestResult({ sharpe_ratio: 1.2, total_pnl: 80 }),
        makeBacktestResult({ sharpe_ratio: 0.8, total_pnl: 50 }),
        makeBacktestResult({ sharpe_ratio: -0.5, total_pnl: -30 }), // one negative
        makeBacktestResult({ sharpe_ratio: 1.0, total_pnl: 70 }),
      ];
      const wf = makeWalkForwardResult(testMetrics);
      const result = assessWalkForwardConsistency(wf, baseOptions);
      expect(result.positiveFraction).toBe(0.8);
      expect(result.consistent).toBe(true);
    });

    it('1 positive window out of N → consistent:false', () => {
      const testMetrics = [
        makeBacktestResult({ sharpe_ratio: -1.0, total_pnl: -50 }),
        makeBacktestResult({ sharpe_ratio: -0.8, total_pnl: -40 }),
        makeBacktestResult({ sharpe_ratio: -0.5, total_pnl: -20 }),
        makeBacktestResult({ sharpe_ratio: 1.5, total_pnl: 100 }), // only one positive
        makeBacktestResult({ sharpe_ratio: -0.3, total_pnl: -10 }),
      ];
      const wf = makeWalkForwardResult(testMetrics);
      const result = assessWalkForwardConsistency(wf, baseOptions);
      expect(result.positiveFraction).toBe(0.2);
      expect(result.consistent).toBe(false);
    });

    it('sign flips counted correctly', () => {
      const testMetrics = [
        makeBacktestResult({ sharpe_ratio: 1.0 }),  // +
        makeBacktestResult({ sharpe_ratio: -0.5 }), // -
        makeBacktestResult({ sharpe_ratio: 0.8 }),  // +
        makeBacktestResult({ sharpe_ratio: -0.3 }), // -
        makeBacktestResult({ sharpe_ratio: 1.2 }),  // +
      ];
      const wf = makeWalkForwardResult(testMetrics);
      const result = assessWalkForwardConsistency(wf, baseOptions);
      expect(result.signFlips).toBe(4); // + → - → + → - → + = 4 flips
      expect(result.consistent).toBe(false); // exceeds maxSignFlips=2
    });

    it('sign flips with zero values', () => {
      const testMetrics = [
        makeBacktestResult({ sharpe_ratio: 1.0 }),  // +
        makeBacktestResult({ sharpe_ratio: 0.0 }),  // 0 (no sign)
        makeBacktestResult({ sharpe_ratio: -0.5 }), // -
      ];
      const wf = makeWalkForwardResult(testMetrics);
      const result = assessWalkForwardConsistency(wf, baseOptions);
      // Math.sign(0) = 0, Math.sign(1) = 1, Math.sign(-0.5) = -1
      // 1 → 0 (no flip, different), 0 → -1 (flip) = 1 flip
      // Actually: sign(1)=1, sign(0)=0, sign(-0.5)=-1
      // 1 !== 0 → flip? No, sign comparison: Math.sign(0) !== Math.sign(1) is true (0 !== 1)
      expect(result.signFlips).toBeGreaterThanOrEqual(1);
    });

    it('degradationRatio passed through from summaryStats', () => {
      const testMetrics = Array.from({ length: 3 }, () =>
        makeBacktestResult({ sharpe_ratio: 1.0, total_pnl: 100 }),
      );
      const wf = makeWalkForwardResult(testMetrics);
      const result = assessWalkForwardConsistency(wf, baseOptions);
      expect(result.degradationRatio).toBe(wf.aggregated.summaryStats.degradationRatio);
    });
  });

  describe('fail-closed: zero windows throws', () => {
    it('empty windows array throws', () => {
      const wf = makeWalkForwardResult([]);
      expect(() => assessWalkForwardConsistency(wf, baseOptions)).toThrow(
        'assessWalkForwardConsistency requires at least 1 window',
      );
    });
  });

  describe('option validation', () => {
    it('minPositiveFraction < 0 throws', () => {
      const testMetrics = [makeBacktestResult({ sharpe_ratio: 1.0 })];
      const wf = makeWalkForwardResult(testMetrics);
      expect(() => assessWalkForwardConsistency(wf, { ...baseOptions, minPositiveFraction: -0.1 })).toThrow(
        'minPositiveFraction must be in [0, 1], got -0.1',
      );
    });

    it('minPositiveFraction > 1 throws', () => {
      const testMetrics = [makeBacktestResult({ sharpe_ratio: 1.0 })];
      const wf = makeWalkForwardResult(testMetrics);
      expect(() => assessWalkForwardConsistency(wf, { ...baseOptions, minPositiveFraction: 1.1 })).toThrow(
        'minPositiveFraction must be in [0, 1], got 1.1',
      );
    });

    it('maxSignFlips < 0 throws', () => {
      const testMetrics = [makeBacktestResult({ sharpe_ratio: 1.0 })];
      const wf = makeWalkForwardResult(testMetrics);
      expect(() => assessWalkForwardConsistency(wf, { ...baseOptions, maxSignFlips: -1 })).toThrow(
        'maxSignFlips must be a non-negative integer, got -1',
      );
    });

    it('maxSignFlips non-integer throws', () => {
      const testMetrics = [makeBacktestResult({ sharpe_ratio: 1.0 })];
      const wf = makeWalkForwardResult(testMetrics);
      expect(() => assessWalkForwardConsistency(wf, { ...baseOptions, maxSignFlips: 1.5 })).toThrow(
        'maxSignFlips must be a non-negative integer, got 1.5',
      );
    });
  });

  describe('edge cases', () => {
    it('falls back to total_pnl when sharpe_ratio is null', () => {
      const testMetrics = [
        makeBacktestResult({ sharpe_ratio: null, total_pnl: 100 }),
        makeBacktestResult({ sharpe_ratio: null, total_pnl: -50 }),
        makeBacktestResult({ sharpe_ratio: null, total_pnl: 200 }),
      ];
      const wf = makeWalkForwardResult(testMetrics);
      const result = assessWalkForwardConsistency(wf, baseOptions);
      // Uses total_pnl as metric: +, -, + = 2 positive out of 3 = 0.66
      expect(result.positiveFraction).toBeCloseTo(0.666, 2);
      expect(result.signFlips).toBe(2); // + → - → +
      expect(result.consistent).toBe(true);
    });

    it('minPositiveFraction = 0 always passes positive fraction check', () => {
      const testMetrics = [
        makeBacktestResult({ sharpe_ratio: -1.0 }),
        makeBacktestResult({ sharpe_ratio: -1.0 }),
      ];
      const wf = makeWalkForwardResult(testMetrics);
      const result = assessWalkForwardConsistency(wf, { minPositiveFraction: 0, maxSignFlips: 10 });
      expect(result.consistent).toBe(true); // 0 fraction >= 0
    });

    it('maxSignFlips = 0 requires no sign flips', () => {
      const testMetrics = [
        makeBacktestResult({ sharpe_ratio: 1.0 }),
        makeBacktestResult({ sharpe_ratio: 1.0 }),
      ];
      const wf = makeWalkForwardResult(testMetrics);
      const result = assessWalkForwardConsistency(wf, { minPositiveFraction: 0.5, maxSignFlips: 0 });
      expect(result.consistent).toBe(true);

      const testMetrics2 = [
        makeBacktestResult({ sharpe_ratio: 1.0 }),
        makeBacktestResult({ sharpe_ratio: -1.0 }),
      ];
      const wf2 = makeWalkForwardResult(testMetrics2);
      const result2 = assessWalkForwardConsistency(wf2, { minPositiveFraction: 0.5, maxSignFlips: 0 });
      expect(result2.consistent).toBe(false); // 1 flip > 0
    });
  });
});