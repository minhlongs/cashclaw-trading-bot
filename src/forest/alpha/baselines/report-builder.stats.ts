// Baseline report builder — trade statistics and equity curve calculations
import { computeSharpe } from '@/forest/backtest/metrics';

/** Win/loss split and profit-factor computation. */
export interface TradeStats {
  wins: number[];
  losses: number[];
  cumPnl: number;
  avgPnl: number;
  profitFactor: number;
  grossProfit: number;
  grossLoss: number;
}

export function computeTradeStats(pnls: number[], tradeCount: number): TradeStats {
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const cumPnl = pnls.reduce((a, b) => a + b, 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  return {
    wins,
    losses,
    cumPnl,
    avgPnl: cumPnl / tradeCount,
    profitFactor: pf,
    grossProfit,
    grossLoss,
  };
}

/** Build equity curve data points and return the curve + sharpe ratio. */
export interface EquityResult {
  eqCurve: { timestamp: number; equity: number; drawdownPct: number }[];
  sharpe: number | null;
}

export function buildEquityCurve(pnls: number[]): EquityResult {
  const equity: number[] = [];
  let eq = 1000;
  for (const p of pnls) {
    eq += p;
    equity.push(eq);
  }
  let peak = 0;
  const eqCurve = equity.map((e, i) => {
    if (e > peak) peak = e;
    const dd = peak > 0 ? (peak - e) / peak : 0;
    return { timestamp: i, equity: e, drawdownPct: dd };
  });
  return { eqCurve, sharpe: computeSharpe(eqCurve) };
}

/** Compute max drawdown from peak equity. */
export function computeMaxDD(pnls: number[]): number {
  let peak = 0, eq = 0, maxDD = 0;
  for (const p of pnls) {
    eq += p;
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}
