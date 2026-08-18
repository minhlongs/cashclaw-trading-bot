// Backtest Engine — extended metrics
// Additional performance metrics on top of computeMetrics.

import type { BacktestTrade, BacktestEquityPoint } from './types';
import type { Fill } from './paper-exchange';
import type { ExtendedBacktestMetrics } from './metrics-types';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sortedByTs(fills: Fill[]): Fill[] {
  return [...fills].sort((a, b) => a.timestamp - b.timestamp);
}

// Build equity curve from fills by simulating buy/sell capital impact.
function buildEquityFromFills(fills: Fill[], cap: number): BacktestEquityPoint[] {
  const sorted = sortedByTs(fills);
  if (sorted.length === 0) return [{ timestamp: 0, equity: cap, drawdownPct: 0 }];
  const points: BacktestEquityPoint[] = [];
  let capital = cap;
  let maxEq = cap;
  points.push({ timestamp: sorted[0].timestamp, equity: capital, drawdownPct: 0 });
  for (const f of sorted) {
    capital += f.side === 'sell' ? f.price * f.quantity - f.fee : -(f.price * f.quantity + f.fee);
    if (capital > maxEq) maxEq = capital;
    const dd = maxEq > 0 ? (maxEq - capital) / maxEq : 0;
    points.push({ timestamp: f.timestamp, equity: capital, drawdownPct: dd });
  }
  return points;
}

// FIFO pairing: consecutive buy+sell into BacktestTrade records.
function buildTradesFromFills(fills: Fill[]): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  const buys: Fill[] = [];
  for (const f of fills) {
    if (f.side === 'buy') { buys.push(f); continue; }
    if (buys.length === 0) continue;
    const buy = buys.shift()!;
    const pnl = (f.price - buy.price) * buy.quantity - buy.fee - f.fee;
    const pnlPct = buy.price > 0 ? pnl / (buy.price * buy.quantity) : 0;
    trades.push({
      entryTimestamp: buy.timestamp, exitTimestamp: f.timestamp,
      side: 'buy', entryPrice: buy.price, exitPrice: f.price,
      quantity: buy.quantity, pnl: Number(pnl.toFixed(2)),
      fee: Number((buy.fee + f.fee).toFixed(2)),
      pnlPct: Number(pnlPct.toFixed(4)),
      holdingMinutes: Math.max(0, Math.round((f.timestamp - buy.timestamp) / 60000)),
    });
  }
  return trades;
}

// Percent of wall-clock time where cumulative position > 0.
function computeExposurePct(fills: Fill[]): number {
  if (fills.length === 0) return 0;
  const sorted = sortedByTs(fills);
  const events = sorted.map((f) => ({
    ts: f.timestamp,
    delta: f.side === 'buy' ? f.quantity : -f.quantity,
  }));
  events.sort((a, b) => a.ts - b.ts);
  const totalSpan = events[events.length - 1].ts - events[0].ts;
  if (totalSpan <= 0) return 0;
  let position = 0;
  let inMarketTime = 0;
  let lastTs = events[0].ts;
  let inMarket = false;
  for (const ev of events) {
    if (inMarket) inMarketTime += ev.ts - lastTs;
    position += ev.delta;
    inMarket = position > 0;
    lastTs = ev.ts;
  }
  return inMarketTime / totalSpan;
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export function computeExtendedMetrics(fills: Fill[], initialCapital: number): ExtendedBacktestMetrics {
  const sorted = sortedByTs(fills);
  const trades = buildTradesFromFills(fills);
  const equityCurve = buildEquityFromFills(fills, initialCapital);

  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const winCount = wins.length;
  const lossCount = losses.length;
  const winRate = totalTrades > 0 ? winCount / totalTrades : 0;
  const totalPnL = trades.reduce((s, t) => s + t.pnl, 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = losses.reduce((s, t) => s + Math.abs(t.pnl), 0);
  const avgWin = winCount > 0 ? grossProfit / winCount : 0;
  const avgLoss = lossCount > 0 ? grossLoss / lossCount : 0;
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;
  const pnls = trades.map((t) => t.pnl);
  const avgTrade = pnls.length > 0 ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0;

  // Max drawdown + duration
  let maxDrawdown = 0;
  let maxDdDuration = 0;
  let peakEq = equityCurve[0]?.equity ?? initialCapital;
  let ddStartTs = equityCurve[0]?.timestamp ?? 0;
  for (const pt of equityCurve) {
    if (pt.equity > peakEq) { peakEq = pt.equity; ddStartTs = pt.timestamp; }
    const dd = peakEq > 0 ? (peakEq - pt.equity) / peakEq : 0;
    if (dd > maxDrawdown) { maxDrawdown = dd; maxDdDuration = pt.timestamp - ddStartTs; }
  }

  // Sortino ratio
  const rets: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev > 0) rets.push((equityCurve[i].equity - prev) / prev);
  }
  let sortinoRatio: number | null = null;
  if (rets.length > 0) {
    const downside = rets.filter((r) => r < 0);
    if (downside.length > 0) {
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const downsideStd = Math.sqrt(downside.reduce((s, r) => s + r * r, 0) / downside.length);
      if (downsideStd > 0) sortinoRatio = (mean / downsideStd) * Math.sqrt(8760);
    } else {
      sortinoRatio = Infinity;
    }
  }

  // CAGR & Calmar
  const startTs = sorted[0]?.timestamp ?? 0;
  const endTs = sorted[sorted.length - 1]?.timestamp ?? 0;
  const finalEquity = equityCurve[equityCurve.length - 1]?.equity ?? initialCapital;
  const spanSec = endTs - startTs;
  let cagr = 0;
  if (spanSec > 0 && initialCapital > 0) {
    const years = spanSec / (365.25 * 86400);
    if (years > 0 && finalEquity > 0) cagr = Math.pow(finalEquity / initialCapital, 1 / years) - 1;
  }
  const calmarRatio = maxDrawdown > 0 ? cagr / maxDrawdown : (cagr > 0 ? Infinity : 0);
  const recoveryFactor = maxDrawdown > 0 ? totalPnL / (maxDrawdown * initialCapital) : 0;
  const totalNotional = sorted.reduce((s, f) => s + f.price * f.quantity, 0);
  const turnover = initialCapital > 0 ? totalNotional / initialCapital : 0;

  return {
    id: '', bot_id: '', strategy: '', pair: '', exchange: '',
    start_date: startTs, end_date: endTs,
    total_trades: totalTrades, win_count: winCount, loss_count: lossCount,
    win_rate: winRate, total_pnl: Number(totalPnL.toFixed(2)),
    max_drawdown: Number(maxDrawdown.toFixed(4)), sharpe_ratio: null,
    params_json: '{}', equity_curve_json: [], trades_json: [], created_at: Date.now(),
    profit_factor: Number.isFinite(profitFactor) ? Number(profitFactor.toFixed(4)) : profitFactor,
    expectancy: Number(expectancy.toFixed(4)),
    sortino_ratio: sortinoRatio,
    max_drawdown_duration: maxDdDuration,
    calmar_ratio: Number.isFinite(calmarRatio) ? Number(calmarRatio.toFixed(4)) : calmarRatio,
    avg_trade: Number(avgTrade.toFixed(4)),
    median_trade: Number(median(pnls).toFixed(4)),
    turnover: Number(turnover.toFixed(4)),
    recovery_factor: Number(recoveryFactor.toFixed(4)),
    exposure_pct: Number(computeExposurePct(sorted).toFixed(4)),
  };
}