// Baseline report builder — converts BacktestTrade[] into EvaluationReport
import type { BacktestTrade } from '@/forest/backtest/types';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import { classifyVol, monthKey, durationBucket, median } from '@/forest/alpha/evaluation/report-helpers';
import { RegimeLabel } from '@/tree/regime/types';
import { computeSharpe } from '@/forest/backtest/metrics';
import type { BaselineConfig } from './types';

export function buildReport(
  trades: BacktestTrade[], cfg: BaselineConfig, totalFees: number,
): EvaluationReport {
  if (trades.length === 0) return emptyReport(cfg);
  const pnls = trades.map((t) => t.pnl);
  const cumPnl = pnls.reduce((a, b) => a + b, 0);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const avg = cumPnl / trades.length;
  const maxDD = computeMaxDD(pnls);
  const rf = maxDD > 0 ? Math.abs(cumPnl / maxDD) : 0;

  const equity: number[] = [];
  let eq = 1000;
  for (const p of pnls) { eq += p; equity.push(eq); }
  let peak = 0;
  const eqCurve = equity.map((e, i) => {
    if (e > peak) peak = e;
    const dd = peak > 0 ? (peak - e) / peak : 0;
    return { timestamp: i, equity: e, drawdownPct: dd };
  });
  const sharpe = computeSharpe(eqCurve);

  const byMonth: Record<string, Partial<EvaluationReport>> = {};
  for (const t of trades) {
    const mk = monthKey(t.entryTimestamp);
    if (!byMonth[mk]) byMonth[mk] = makeEmpty();
    byMonth[mk].netPnl = (byMonth[mk].netPnl ?? 0) + t.pnl;
    byMonth[mk].numTrades = (byMonth[mk].numTrades ?? 0) + 1;
  }

  const byVol: Record<string, Partial<EvaluationReport>> = {};
  const volBuckets = classifyVol(
    trades.map((t) => ({ timestamp: t.entryTimestamp, open: t.entryPrice, high: t.entryPrice, low: t.exitPrice, close: t.exitPrice, volume: 0 })),
  );
  for (let i = 0; i < trades.length; i++) {
    const vb = volBuckets[i] ?? 'medium';
    if (!byVol[vb]) byVol[vb] = makeEmpty();
    byVol[vb].netPnl = (byVol[vb].netPnl ?? 0) + trades[i].pnl;
    byVol[vb].numTrades = (byVol[vb].numTrades ?? 0) + 1;
  }

  const dur = durationBucket(trades);
  const durResult: { short: Partial<EvaluationReport>; medium: Partial<EvaluationReport>; long: Partial<EvaluationReport> } = {
    short: makeEmpty(), medium: makeEmpty(), long: makeEmpty(),
  };
  for (const [k, ts] of Object.entries(dur) as [string, BacktestTrade[]][]) {
    durResult[k as keyof typeof durResult].numTrades = ts.length;
    durResult[k as keyof typeof durResult].netPnl = ts.reduce((a, t) => a + t.pnl, 0);
  }

  return {
    experimentId: `baseline_${cfg.strategy}`, symbol: cfg.symbol, timeframe: cfg.timeframe,
    regime: RegimeLabel.UNKNOWN,
    totalReturn: cumPnl, netPnl: cumPnl, cagr: 0,
    winRate: wins.length / trades.length, lossRate: losses.length / trades.length,
    profitFactor: Number.isFinite(pf) ? pf : 0, expectancy: avg,
    sharpe: sharpe || null, sortino: null,
    maxDrawdown: maxDD, avgTrade: avg, medianTrade: median(pnls), numTrades: trades.length,
    turnover: 0, fees: totalFees, slippage: totalFees / 2, exposure: 0, recoveryFactor: rf,
    byRegime: {} as Record<RegimeLabel, Partial<EvaluationReport>>,
    byMonth, byVolBucket: byVol, byDuration: durResult,
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

function computeMaxDD(pnls: number[]): number {
  let peak = 0, eq = 0, maxDD = 0;
  for (const p of pnls) { eq += p; if (eq > peak) peak = eq; const dd = peak - eq; if (dd > maxDD) maxDD = dd; }
  return maxDD;
}

function makeEmpty(): Partial<EvaluationReport> {
  return { netPnl: 0, numTrades: 0, winRate: 0, maxDrawdown: 0 };
}
