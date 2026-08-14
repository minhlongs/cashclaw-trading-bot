// Backtest Engine — metrics & report helpers
// Functions for building trades, equity curves, and computing statistics.

import type { Candle } from './ohlcv';
import type { BacktestTrade, BacktestEquityPoint } from './types';
import type { Fill } from './paper-exchange';

// ──────────────────────────────────────────────
// Post-processing: fill pairs -> BacktestTrade
// Also computes buy-and-hold for reference
// Capital goes up on sell, down on buy — realized PnL = cumulative capital delta from sells minus buys
// ──────────────────────────────────────────────

/**
 * Convert raw fills into BacktestTrade records.
 * Uses FIFO: each buy is paired with the next sell on the opposite side.
 */
export function buildTradesFromFills(fills: Fill[], feePct: number, capitalStart: number): BacktestTrade[] {
  // Track capital after each fill to identify realized P&L from sells
  // We'll use a "trade pot" approach: track capital committed to open positions,
  // realized when sold.
  const trades: BacktestTrade[] = [];
  // Each "round trip" = one buy followed by a sell of the same or smaller qty
  // Stack pending buys, match sells FIFO
  const pendingBuys: Fill[] = [];

  for (const f of fills) {
    if (f.side === 'buy') {
      pendingBuys.push(f);
    } else if (pendingBuys.length > 0) {
      const buy = pendingBuys.shift()!;
      const totalFee = buy.fee + f.fee;
      const pnl = (f.price - buy.price) * buy.quantity - totalFee;
      const pnlPct = buy.price > 0 ? ((f.price - buy.price) / buy.price) * 100 : 0;
      trades.push({
        entryTimestamp: buy.timestamp,
        exitTimestamp: f.timestamp,
        side: 'buy',
        entryPrice: buy.price,
        exitPrice: f.price,
        quantity: buy.quantity,
        pnl: Number(pnl.toFixed(2)),
        fee: Number(totalFee.toFixed(2)),
        pnlPct: Number(pnlPct.toFixed(4)),
        holdingMinutes: Math.max(0, Math.round((f.timestamp - buy.timestamp) / 60000)),
      });
    }
    // Sells with no matching buy are ignored (could be closing pre-existing positions)
  }

  return trades;
}

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
 * Uses 8760 factor (hourly candles -> annualized).
 * Returns 0 if there are fewer than 2 data points.
 */
export function computeSharpe(curve: BacktestEquityPoint[]): number {
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
  return (mean / std) * Math.sqrt(8760); // 1h candles -> 8760/year
}
