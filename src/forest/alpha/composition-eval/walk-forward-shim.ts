// Walk-Forward Shim for Composition Results
// Adapts CompositionWalkForwardResult into WalkForwardResult for assessWalkForwardConsistency.
// Pure function, no side effects.

import type { BacktestResult } from '@/forest/backtest/types';
import { RegimeLabel } from '@/tree/regime/types';
import type {
  WalkForwardResult,
  WalkForwardWindow,
} from '@/forest/backtest/walkforward';
import type { CompositionWalkForwardResult } from './types';

function placeholderMetrics(totalPnl: number, sharpeRatio: number | null = null): BacktestResult {
  return {
    id: '',
    bot_id: '',
    strategy: 'composition_shim',
    pair: 'COMPOSITION',
    exchange: '',
    start_date: 0,
    end_date: 0,
    total_trades: 0,
    win_count: 0,
    loss_count: 0,
    win_rate: 0,
    total_pnl: totalPnl,
    max_drawdown: 0,
    sharpe_ratio: sharpeRatio,
    params_json: '',
    equity_curve_json: [],
    trades_json: [],
    created_at: 0,
  };
}

/**
 * Reshape a composition walk-forward result into the WalkForwardResult-compatible
 * shim consumed by assessWalkForwardConsistency().
 */
export function toWalkForwardShim(wfResult: CompositionWalkForwardResult): WalkForwardResult {
  if (wfResult.windows.length === 0) {
    throw new Error('toWalkForwardShim: walk-forward result has no windows');
  }

  const windows: WalkForwardWindow[] = wfResult.windows.map((w) => ({
    trainStart: w.bounds.trainStart,
    trainEnd: w.bounds.trainEnd,
    validateStart: w.bounds.validateStart,
    validateEnd: w.bounds.validateEnd,
    testStart: w.bounds.testStart,
    testEnd: w.bounds.testEnd,
    trainMetrics: placeholderMetrics(
      w.trainResult.totalReturn,
      w.trainResult.annualizedSharpe,
    ),
    validateMetrics: placeholderMetrics(
      w.validateResult.totalReturn,
      w.validateResult.annualizedSharpe,
    ),
    testMetrics: placeholderMetrics(
      w.testResult.totalReturn,
      w.testResult.annualizedSharpe,
    ),
    regimeAtTestStart: RegimeLabel.UNKNOWN,
  }));

  return {
    windows,
    aggregated: {
      inSample: placeholderMetrics(0, wfResult.summaryStats.avgInSampleSharpe),
      validation: placeholderMetrics(0),
      outOfSample: placeholderMetrics(
        wfResult.stitched.totalReturn,
        wfResult.summaryStats.avgOutSampleSharpe,
      ),
      byRegime: {} as Record<RegimeLabel, ReturnType<typeof placeholderMetrics>>,
      summaryStats: {
        totalWindows: windows.length,
        avgInSampleSharpe: wfResult.summaryStats.avgInSampleSharpe,
        avgOutSampleSharpe: wfResult.summaryStats.avgOutSampleSharpe,
        degradationRatio: wfResult.summaryStats.degradationRatio,
        regimeDiversity: 0,
      },
    },
  };
}
