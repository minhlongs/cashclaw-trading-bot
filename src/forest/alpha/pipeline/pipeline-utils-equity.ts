import type { BacktestTrade, BacktestEquityPoint } from '@/forest/backtest/types';
import { computeSharpe } from '@/forest/backtest/metrics';
import { parseCandleIntervalMinutes } from './pipeline-utils-reporting';

export function computeEquityAndSharpe(
  trades: BacktestTrade[],
  timeframe: string,
): { equityCurve: BacktestEquityPoint[]; sharpe: number; maxDrawdownPct: number } {
  let equity = 10000, peak = equity, maxDrawdownPct = 0;
  const equityCurve: BacktestEquityPoint[] = [];
  for (const t of trades) {
    equity += t.pnl;
    peak = Math.max(peak, equity);
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
    equityCurve.push({ timestamp: t.exitTimestamp, equity, drawdownPct: dd });
  }
  const intervalMin = parseCandleIntervalMinutes(timeframe);
  const sharpe = equityCurve.length >= 2 ? computeSharpe(equityCurve, intervalMin) : 0;
  return { equityCurve, sharpe, maxDrawdownPct };
}
