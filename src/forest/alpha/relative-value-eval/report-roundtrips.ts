import type { PairPeriodRecord } from '@/tree/alpha/relative-value';
import { extractRoundTrips } from './round-trips';
import type { RoundTripMetrics } from './types';

export function computeRoundTripMetrics(periods: readonly PairPeriodRecord[]): RoundTripMetrics {
  const { roundTrips } = extractRoundTrips(periods);
  if (roundTrips.length === 0) {
    return { expectancyPerTrade: 0, profitFactor: 0, winRate: 0, completedTrades: 0 };
  }
  const nets = roundTrips.map((t) => t.netReturn);
  const grossProfit = nets.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(nets.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  const wins = nets.filter((r) => r > 0).length;
  const rawProfitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  return {
    expectancyPerTrade: nets.reduce((a, b) => a + b, 0) / nets.length,
    profitFactor: Number.isFinite(rawProfitFactor) ? rawProfitFactor : 0,
    winRate: wins / nets.length,
    completedTrades: roundTrips.length,
  };
}
