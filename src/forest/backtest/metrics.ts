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

interface OpenBuyLot {
  timestamp: number;
  price: number;
  quantity: number;
  remainingQty: number;
  feePerUnit: number;
}

/**
 * Convert raw fills into BacktestTrade records.
 * Uses FIFO multi-fill lot matching: sells are matched against open buy lots in chronological order,
 * correctly unwinding multi-step DCA accumulation on single aggregate exits.
 */
export function buildTradesFromFills(fills: Fill[], _feePct: number, _capitalStart: number): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  const openBuys: OpenBuyLot[] = [];

  for (const f of fills) {
    if (f.side === 'buy') {
      const feePerUnit = f.quantity > 0 ? f.fee / f.quantity : 0;
      openBuys.push({
        timestamp: f.timestamp,
        price: f.price,
        quantity: f.quantity,
        remainingQty: f.quantity,
        feePerUnit,
      });
    } else if (openBuys.length > 0) {
      const sellFeePerUnit = f.quantity > 0 ? f.fee / f.quantity : 0;
      let sellQtyRemaining = f.quantity;

      while (sellQtyRemaining > 1e-8 && openBuys.length > 0) {
        const buyLot = openBuys[0];
        const matchedQty = Math.min(buyLot.remainingQty, sellQtyRemaining);
        const allocatedFees = (buyLot.feePerUnit + sellFeePerUnit) * matchedQty;
        const pnl = (f.price - buyLot.price) * matchedQty - allocatedFees;
        const pnlPct = buyLot.price > 0 ? ((f.price - buyLot.price) / buyLot.price) * 100 : 0;

        trades.push({
          entryTimestamp: buyLot.timestamp,
          exitTimestamp: f.timestamp,
          side: 'buy',
          entryPrice: buyLot.price,
          exitPrice: f.price,
          quantity: matchedQty,
          pnl: Number(pnl.toFixed(2)),
          fee: Number(allocatedFees.toFixed(2)),
          pnlPct: Number(pnlPct.toFixed(4)),
          holdingMinutes: Math.max(0, Math.round((f.timestamp - buyLot.timestamp) / 60000)),
        });

        buyLot.remainingQty -= matchedQty;
        sellQtyRemaining -= matchedQty;

        if (buyLot.remainingQty <= 1e-8) {
          openBuys.shift();
        }
      }
    }
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
