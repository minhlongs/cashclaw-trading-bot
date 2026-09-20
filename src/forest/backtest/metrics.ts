// Backtest Engine — metrics & report helpers
// Functions for building trades, equity curves, and computing statistics.

import type { Candle } from './ohlcv';
import type { BacktestTrade, BacktestEquityPoint } from './types';

export { buildTradesFromFills } from './metrics-trades';

// ──────────────────────────────────────────────
// Equity Curve from candle-close prices + realized trades
// ──────────────────────────────────────────────

/**
 * Build equity curve from starting capital, candles, and realized trades.
 * Realized PnL is credited at each candle's timestamp.
 */
export function buildEquity(
  capitalStart: number,
  candles: Candle[],
  trades: BacktestTrade[],
): BacktestEquityPoint[] {
  const curve: BacktestEquityPoint[] = [];
  let cumPnl = 0;
  let ti = 0;
  let maxEq = capitalStart;

  for (let i = 0; i < candles.length; i++) {
    const ts = candles[i].timestamp;
    // Credit trades that closed before/at this candle
    while (ti < trades.length && trades[ti].exitTimestamp <= ts) {
      cumPnl += trades[ti].pnl;
      ti++;
    }
    const eq = capitalStart + cumPnl;
    const dd = maxEq > 0 ? ((maxEq - eq) / maxEq) * 100 : 0;
    curve.push({ timestamp: ts, equity: eq, drawdownPct: dd });
    if (eq > maxEq) maxEq = eq;
  }

  return curve;
}

// ──────────────────────────────────────────────
// Sharpe ratio
// ──────────────────────────────────────────────

/**
 * Compute annualized Sharpe ratio from equity curve.
 * @param curve Equity curve in chronological order.
 * @param candleIntervalMinutes Candle interval in minutes (default 60 = 1h).
 */
export function computeSharpe(
  curve: BacktestEquityPoint[],
  candleIntervalMinutes = 60,
): number {
  if (curve.length < 2) return 0;

  const rets: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].equity;
    const curr = curve[i].equity;
    if (prev > 0) rets.push((curr - prev) / prev);
  }
  if (rets.length === 0) return 0;

  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  const periodsPerYear = (365 * 24 * 60) / candleIntervalMinutes;
  return (mean / std) * Math.sqrt(periodsPerYear);
}
