import type { BacktestTrade } from '@/forest/backtest/types';

export function computeMaxDrawdown(trades: BacktestTrade[]): number {
  let peak = 0, cumPnl = 0, maxDD = 0;
  for (const t of trades) {
    cumPnl += t.pnl;
    if (cumPnl > peak) peak = cumPnl;
    const dd = peak - cumPnl;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

export function durationBucket(trades: BacktestTrade[]): {
  short: BacktestTrade[];
  medium: BacktestTrade[];
  long: BacktestTrade[];
} {
  if (trades.length < 10) return { short: trades, medium: [], long: [] };
  if (trades.length < 50) return { short: trades.slice(0, 10), medium: trades.slice(10), long: [] };
  return {
    short: trades.slice(0, 10),
    medium: trades.slice(10, 50),
    long: trades.slice(50),
  };
}
