// Backtest Engine — Walk-Forward Validation
// Sliding or expanding window optimization that never tests on training data.

import type { BacktestResult } from './types';
import type { Candle } from './ohlcv';
import { RegimeLabel } from '@/tree/regime/types';

// ── Types ─────────────────────────────────────

export interface WindowConfig {
  trainBars: number;
  validateBars: number;
  testBars: number;
  stepBars: number;
}

export type WindowMode = 'rolling' | 'expanding';

export interface WalkForwardWindow {
  trainStart: number;
  trainEnd: number;
  validateStart: number;
  validateEnd: number;
  testStart: number;
  testEnd: number;
  trainMetrics: BacktestResult;
  validateMetrics: BacktestResult;
  testMetrics: BacktestResult;
  regimeAtTestStart: RegimeLabel;
}

export interface SummaryStats {
  totalWindows: number;
  avgInSampleSharpe: number;
  avgOutSampleSharpe: number;
  degradationRatio: number;
  regimeDiversity: number;
}

/** Partial BacktestResult — aggregated metrics omit id/bot_id/strategy/pair/exchange */
type AggregatedMetrics = Omit<BacktestResult, 'id' | 'bot_id' | 'strategy' | 'pair' | 'exchange'>;

export interface WalkForwardResult {
  windows: WalkForwardWindow[];
  aggregated: {
    inSample: AggregatedMetrics;
    validation: AggregatedMetrics;
    outOfSample: AggregatedMetrics;
    byRegime: Record<RegimeLabel, AggregatedMetrics>;
    summaryStats: SummaryStats;
  };
}

/** Run a backtest on a candle slice; caller owns strategy config. */
export type RunBacktestFn = (candles: Candle[]) => BacktestResult;

/** Detect regime at a given candle index. Must be pure. */
export type DetectRegimeFn = (candles: Candle[], index: number) => RegimeLabel;

// ── Helpers ───────────────────────────────────

function averageResults(results: BacktestResult[]): AggregatedMetrics {
  if (results.length === 0) throw new Error('Cannot average empty results');
  const n = results.length;
  const pick = (k: keyof BacktestResult): number =>
    results.reduce((a, r) => a + (Number(r[k]) || 0), 0) / n;
  const pickNull = (k: keyof BacktestResult): number | null => {
    const vals = results.map(r => r[k] as number | null).filter(v => v !== null);
    return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  const first = results[0];
  return {
    start_date: first.start_date,
    end_date: results[results.length - 1].end_date,
    total_trades: Math.round(pick('total_trades')),
    win_count: Math.round(pick('win_count')),
    loss_count: Math.round(pick('loss_count')),
    win_rate: Number(pick('win_rate').toFixed(4)),
    total_pnl: Number(pick('total_pnl').toFixed(2)),
    max_drawdown: Number(pick('max_drawdown').toFixed(2)),
    sharpe_ratio: pickNull('sharpe_ratio'),
    params_json: first.params_json,
    equity_curve_json: [],
    trades_json: [],
    created_at: Date.now(),
  } as AggregatedMetrics;
}

interface WindowSlice {
  trainStart: number;
  trainEnd: number;
  validateStart: number;
  validateEnd: number;
  testStart: number;
  testEnd: number;
}

function computeSlices(totalBars: number, cfg: WindowConfig, mode: WindowMode): WindowSlice[] {
  const minBars = cfg.trainBars + cfg.validateBars + cfg.testBars;
  if (totalBars < minBars) {
    throw new Error(`Not enough candles: ${totalBars} < ${minBars} (train+validate+test)`);
  }
  if (cfg.stepBars <= 0) throw new Error('stepBars must be > 0');

  const slices: WindowSlice[] = [];
  let offset = 0;
  while (true) {
    const trainStart = mode === 'expanding' ? 0 : offset;
    const trainEnd = offset + cfg.trainBars;
    const validateStart = trainEnd;
    const validateEnd = validateStart + cfg.validateBars;
    const testStart = validateEnd;
    const testEnd = testStart + cfg.testBars;
    if (testEnd > totalBars) break;
    slices.push({ trainStart, trainEnd, validateStart, validateEnd, testStart, testEnd });
    offset += cfg.stepBars;
  }
  return slices;
}

// ── Main entry ────────────────────────────────

export function runWalkForward(
  candles: Candle[],
  config: WindowConfig,
  mode: WindowMode,
  runBacktestFn: RunBacktestFn,
  detectRegimeFn: DetectRegimeFn,
): WalkForwardResult {
  const slices = computeSlices(candles.length, config, mode);
  if (slices.length === 0) {
    throw new Error('No valid windows produced — check config vs candle count');
  }

  const windows: WalkForwardWindow[] = slices.map(s => ({
    trainStart: s.trainStart, trainEnd: s.trainEnd,
    validateStart: s.validateStart, validateEnd: s.validateEnd,
    testStart: s.testStart, testEnd: s.testEnd,
    trainMetrics: runBacktestFn(candles.slice(s.trainStart, s.trainEnd)),
    validateMetrics: runBacktestFn(candles.slice(s.validateStart, s.validateEnd)),
    testMetrics: runBacktestFn(candles.slice(s.testStart, s.testEnd)),
    regimeAtTestStart: detectRegimeFn(candles, s.testStart),
  }));

  const inSample = averageResults(windows.map(w => w.trainMetrics));
  const validation = averageResults(windows.map(w => w.validateMetrics));
  const outOfSample = averageResults(windows.map(w => w.testMetrics));

  // Group test results by regime
  const regimeMap = new Map<RegimeLabel, BacktestResult[]>();
  for (const w of windows) {
    const existing = regimeMap.get(w.regimeAtTestStart) ?? [];
    existing.push(w.testMetrics);
    regimeMap.set(w.regimeAtTestStart, existing);
  }
  const byRegime: Record<RegimeLabel, AggregatedMetrics> = {} as Record<RegimeLabel, AggregatedMetrics>;
  for (const [label, results] of regimeMap) {
    byRegime[label] = averageResults(results);
  }

  const avgIn = inSample.sharpe_ratio ?? 0;
  const avgOut = outOfSample.sharpe_ratio ?? 0;
  return {
    windows,
    aggregated: {
      inSample, validation, outOfSample, byRegime,
      summaryStats: {
        totalWindows: windows.length,
        avgInSampleSharpe: Number(avgIn.toFixed(4)),
        avgOutSampleSharpe: Number(avgOut.toFixed(4)),
        degradationRatio: avgIn !== 0 ? Number((avgOut / avgIn).toFixed(4)) : 0,
        regimeDiversity: regimeMap.size,
      },
    },
  };
}
