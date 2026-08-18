// Regime-Conditioned Backtest — classify regimes per window, route alphas, compare performance
// Wraps the existing backtest engine with regime-aware signal filtering.

import type { Candle } from './ohlcv';
import type { AlphaSignal } from '@/tree/alpha/types';
import { RegimeLabel, type RegimeConfig } from '@/tree/regime/types';
import { RuleBasedRegimeClassifier } from '@/tree/regime/classifier';
import { extractRegimeFeatures } from '@/tree/regime/features';
import { routeAlphas, type AlphaRouterConfig } from '@/tree/regime/alpha-router';
import type {
  RegimeBacktestConfig,
  RegimeWindow,
  RegimePerformance,
  RegimeBacktestResult,
} from './regime-backtest-types';

// Re-export types for external consumers
export type {
  RegimeBacktestConfig,
  RegimeWindow,
  RegimePerformance,
  RegimeBacktestResult,
} from './regime-backtest-types';

// ── Core Function ──────────────────────────────────────────────────────────

/**
 * Run a regime-conditioned backtest over candle data.
 * Classifies regime per window, routes alpha signals through regime filter,
 * and compares against a non-conditioned baseline.
 */
export function runRegimeBacktest(
  candles: Candle[],
  alphas: AlphaSignal[],
  config: RegimeBacktestConfig,
): RegimeBacktestResult {
  if (candles.length === 0) throw new Error('No candles provided');
  if (alphas.length === 0) throw new Error('No alpha signals provided');

  const { windowSize, stepSize, regimeConfig, routerConfig } = config;
  const classifier = new RuleBasedRegimeClassifier();

  const windows: RegimeWindow[] = [];
  const regimePerfMap = new Map<RegimeLabel, RegimePerformance>();

  for (let start = 0; start + windowSize <= candles.length; start += stepSize) {
    const end = start + windowSize;
    const windowCandles = candles.slice(start, end);

    // 1. Classify regime for this window
    const features = extractRegimeFeatures(windowCandles, regimeConfig);
    if (features === null) continue; // insufficient data for this window
    const result = classifier.classify(features, regimeConfig);
    const regime = result.label;

    // 2. Route alphas through regime filter
    const routed = routeAlphas(regime, alphas, routerConfig);

    // 3. Estimate window metrics from routed signals
    const trades = routed.length;
    const pnl = estimateWindowPnl(windowCandles, routed);
    const sharpe = computeWindowSharpe(windowCandles, routed);

    windows.push({ start, end, regime, trades, pnl, sharpe });

    // 4. Aggregate per-regime
    const existing = regimePerfMap.get(regime);
    if (existing) {
      existing.totalPnl += pnl;
      existing.totalTrades += trades;
      existing.windowCount += 1;
    } else {
      regimePerfMap.set(regime, {
        avgSharpe: sharpe,
        totalPnl: pnl,
        totalTrades: trades,
        windowCount: 1,
      });
    }
  }

  // Compute avgSharpe per regime
  for (const [label, perf] of regimePerfMap) {
    perf.avgSharpe = computeRegimeAvgSharpe(windows, label);
  }

  const regimePerformance: Partial<Record<RegimeLabel, RegimePerformance>> = {};
  for (const [label, perf] of regimePerfMap) {
    regimePerformance[label] = perf;
  }

  const regimeSharpe = computeOverallSharpe(windows);

  // Non-conditioned baseline (all signals, no filtering)
  const baselineWindows = buildBaselineWindows(candles, alphas, config);
  const baselineSharpe = computeOverallSharpe(baselineWindows);
  const overallImprovement = computeImprovement(regimeSharpe, baselineSharpe);

  return { windows, regimePerformance, regimeSharpe, baselineSharpe, overallImprovement };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function estimateWindowPnl(candles: Candle[], signals: AlphaSignal[]): number {
  if (candles.length < 2 || signals.length === 0) return 0;
  let pnl = 0;
  const priceChange = candles[candles.length - 1].close - candles[0].close;
  for (const signal of signals) {
    const dir = signal.direction === 'buy' ? 1 : signal.direction === 'sell' ? -1 : 0;
    pnl += dir * signal.confidence * priceChange;
  }
  return Number(pnl.toFixed(4));
}

function computeWindowSharpe(candles: Candle[], signals: AlphaSignal[]): number | null {
  if (candles.length < 3 || signals.length === 0) return null;
  const returns: number[] = [];
  const avgConf = signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length;
  for (let i = 1; i < candles.length; i++) {
    const pct = (candles[i].close - candles[i - 1].close) / candles[i - 1].close;
    returns.push(pct * avgConf);
  }
  if (returns.length === 0) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  return Number(((mean / std) * Math.sqrt(returns.length)).toFixed(4));
}

function computeOverallSharpe(windows: RegimeWindow[]): number | null {
  const sharpes = windows.map((w) => w.sharpe).filter((s): s is number => s !== null);
  if (sharpes.length === 0) return null;
  const mean = sharpes.reduce((a, b) => a + b, 0) / sharpes.length;
  return Number(mean.toFixed(4));
}

function computeRegimeAvgSharpe(windows: RegimeWindow[], regime: RegimeLabel): number | null {
  const regimeSharpes = windows
    .filter((w) => w.regime === regime)
    .map((w) => w.sharpe)
    .filter((s): s is number => s !== null);
  if (regimeSharpes.length === 0) return null;
  const mean = regimeSharpes.reduce((a, b) => a + b, 0) / regimeSharpes.length;
  return Number(mean.toFixed(4));
}

function buildBaselineWindows(
  candles: Candle[],
  alphas: AlphaSignal[],
  config: RegimeBacktestConfig,
): RegimeWindow[] {
  const { windowSize, stepSize } = config;
  const windows: RegimeWindow[] = [];
  for (let start = 0; start + windowSize <= candles.length; start += stepSize) {
    const end = start + windowSize;
    const windowCandles = candles.slice(start, end);
    windows.push({
      start, end,
      regime: RegimeLabel.UNKNOWN,
      trades: alphas.length,
      pnl: estimateWindowPnl(windowCandles, alphas),
      sharpe: computeWindowSharpe(windowCandles, alphas),
    });
  }
  return windows;
}

function computeImprovement(
  regimeSharpe: number | null,
  baselineSharpe: number | null,
): number | null {
  if (regimeSharpe === null || baselineSharpe === null) return null;
  if (baselineSharpe === 0) return null;
  return Number(((regimeSharpe - baselineSharpe) / Math.abs(baselineSharpe)).toFixed(4));
}
