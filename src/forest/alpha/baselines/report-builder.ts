// Baseline report builder — converts BacktestTrade[] into EvaluationReport
import type { BacktestTrade } from '@/forest/backtest/types';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import { classifyVol, monthKey, durationBucket, median } from '@/forest/alpha/evaluation/report-helpers';
import { RegimeLabel } from '@/tree/regime/types';
import { computeSharpe } from '@/forest/backtest/metrics';
import type { BaselineConfig } from './types';

// ── Extraction helpers (reduce buildReport complexity) ────────────────────────

/** Win/loss split and profit-factor computation. */
interface TradeStats {
  wins: number[];
  losses: number[];
  cumPnl: number;
  avgPnl: number;
  profitFactor: number;
  grossProfit: number;
  grossLoss: number;
}

function computeTradeStats(pnls: number[], tradeCount: number): TradeStats {
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
interface EquityResult {
  eqCurve: { timestamp: number; equity: number; drawdownPct: number }[];
  sharpe: number | null;
}

function buildEquityCurve(pnls: number[]): EquityResult {
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

/** Aggregate trades by month key. */
function aggregateByMonth(
  trades: BacktestTrade[],
): Record<string, Partial<EvaluationReport>> {
  const byMonth: Record<string, Partial<EvaluationReport>> = {};
  for (const t of trades) {
    const mk = monthKey(t.entryTimestamp);
    if (!byMonth[mk]) byMonth[mk] = { netPnl: 0, numTrades: 0, winRate: 0, maxDrawdown: 0 };
    byMonth[mk].netPnl = (byMonth[mk].netPnl ?? 0) + t.pnl;
    byMonth[mk].numTrades = (byMonth[mk].numTrades ?? 0) + 1;
  }
  return byMonth;
}

/** Aggregate trades by volatility bucket. */
function aggregateByVolume(
  trades: BacktestTrade[],
): Record<string, Partial<EvaluationReport>> {
  const byVol: Record<string, Partial<EvaluationReport>> = {};
  const volBuckets = classifyVol(
    trades.map((t) => ({
      timestamp: t.entryTimestamp, open: t.entryPrice,
      high: t.entryPrice, low: t.exitPrice, close: t.exitPrice, volume: 0,
    })),
  );
  for (let i = 0; i < trades.length; i++) {
    const vb = volBuckets[i] ?? 'medium';
    if (!byVol[vb]) byVol[vb] = { netPnl: 0, numTrades: 0, winRate: 0, maxDrawdown: 0 };
    byVol[vb].netPnl = (byVol[vb].netPnl ?? 0) + trades[i].pnl;
    byVol[vb].numTrades = (byVol[vb].numTrades ?? 0) + 1;
  }
  return byVol;
}

/** Aggregate trades by holding duration bucket. */
function aggregateByDuration(
  trades: BacktestTrade[],
): { short: Partial<EvaluationReport>; medium: Partial<EvaluationReport>; long: Partial<EvaluationReport> } {
  const dur = durationBucket(trades);
  const result: { short: Partial<EvaluationReport>; medium: Partial<EvaluationReport>; long: Partial<EvaluationReport> } = {
    short: { netPnl: 0, numTrades: 0, winRate: 0, maxDrawdown: 0 },
    medium: { netPnl: 0, numTrades: 0, winRate: 0, maxDrawdown: 0 },
    long: { netPnl: 0, numTrades: 0, winRate: 0, maxDrawdown: 0 },
  };
  for (const [k, ts] of Object.entries(dur) as [string, BacktestTrade[]][]) {
    result[k as keyof typeof result].numTrades = ts.length;
    result[k as keyof typeof result].netPnl = ts.reduce((a, t) => a + t.pnl, 0);
  }
  return result;
}

/** Compute max drawdown from peak equity. */
function computeMaxDD(pnls: number[]): number {
  let peak = 0, eq = 0, maxDD = 0;
  for (const p of pnls) {
    eq += p;
    if (eq > peak) peak = eq;
    const dd = peak - eq;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function buildReport(
  trades: BacktestTrade[], cfg: BaselineConfig, totalFees: number,
): EvaluationReport {
  if (trades.length === 0) return emptyReport(cfg);

  const pnls = trades.map((t) => t.pnl);
  const stats = computeTradeStats(pnls, trades.length);
  const maxDD = computeMaxDD(pnls);
  const rf = maxDD > 0 ? Math.abs(stats.cumPnl / maxDD) : 0;
  const { sharpe } = buildEquityCurve(pnls);
  const byMonth = aggregateByMonth(trades);
  const byVol = aggregateByVolume(trades);
  const byDuration = aggregateByDuration(trades);

  return {
    experimentId: `baseline_${cfg.strategy}`, symbol: cfg.symbol, timeframe: cfg.timeframe,
    regime: RegimeLabel.UNKNOWN,
    totalReturn: stats.cumPnl, netPnl: stats.cumPnl, cagr: 0,
    winRate: stats.wins.length / trades.length, lossRate: stats.losses.length / trades.length,
    profitFactor: Number.isFinite(stats.profitFactor) ? stats.profitFactor : 0,
    expectancy: stats.avgPnl,
    sharpe: sharpe || null, sortino: null,
    maxDrawdown: maxDD, avgTrade: stats.avgPnl, medianTrade: median(pnls),
    numTrades: trades.length,
    turnover: 0, fees: totalFees, slippage: totalFees / 2, exposure: 0, recoveryFactor: rf,
    byRegime: {} as Record<RegimeLabel, Partial<EvaluationReport>>,
    byMonth, byVolBucket: byVol, byDuration,
  };
}

export function emptyReport(cfg: BaselineConfig): EvaluationReport {
  return {
    experimentId: `baseline_${cfg.strategy}`, symbol: cfg.symbol, timeframe: cfg.timeframe,
    regime: RegimeLabel.UNKNOWN, totalReturn: 0, netPnl: 0, cagr: 0,
    winRate: 0, lossRate: 0, profitFactor: 0, expectancy: 0,
    sharpe: null, sortino: null, maxDrawdown: 0, avgTrade: 0, medianTrade: 0,
    numTrades: 0, turnover: 0, fees: 0, slippage: 0, exposure: 0, recoveryFactor: 0,
    byRegime: {} as Record<RegimeLabel, Partial<EvaluationReport>>,
    byMonth: {}, byVolBucket: {}, byDuration: { short: {}, medium: {}, long: {} },
  };
}
