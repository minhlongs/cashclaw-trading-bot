// Baseline report builder — monthly, volume, and duration aggregations
import type { BacktestTrade } from '@/forest/backtest/types';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import { classifyVol, monthKey, durationBucket } from '@/forest/alpha/evaluation/report-helpers';

/** Aggregate trades by month key. */
export function aggregateByMonth(
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
export function aggregateByVolume(
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
export function aggregateByDuration(
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
