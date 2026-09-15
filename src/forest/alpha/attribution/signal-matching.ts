// Alpha Attribution Engine — signal ↔ trade join

import type { AlphaSignal } from '@/tree/alpha/types';
import type { BacktestTrade } from '@/forest/backtest/types';

/** Binary-search for the rightmost signal whose timestamp <= trade entry. */
export function findLatestSignal(
  sortedSignals: AlphaSignal[],
  entryTimestamp: number,
): AlphaSignal {
  let lo = 0;
  let hi = sortedSignals.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedSignals[mid].timestamp <= entryTimestamp) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return sortedSignals[best];
}

/** Match every trade to the latest preceding signal. */
export function matchTradesToSignals(
  trades: BacktestTrade[],
  sortedSignals: AlphaSignal[],
): Map<string, { trade: BacktestTrade; signal: AlphaSignal }> {
  const matched = new Map<string, { trade: BacktestTrade; signal: AlphaSignal }>();
  for (const trade of trades) {
    const signal = findLatestSignal(sortedSignals, trade.entryTimestamp);
    matched.set(`${trade.entryTimestamp}-${trade.exitTimestamp}`, { trade, signal });
  }
  return matched;
}

/** Group matched pairs by alpha signal name. */
export function groupByAlpha(
  matched: Map<string, { trade: BacktestTrade; signal: AlphaSignal }>,
): Map<string, { trades: BacktestTrade[]; signals: AlphaSignal[] }> {
  const groups = new Map<string, { trades: BacktestTrade[]; signals: AlphaSignal[] }>();
  for (const { trade, signal } of matched.values()) {
    const g = groups.get(signal.name) ?? { trades: [], signals: [] };
    g.trades.push(trade);
    g.signals.push(signal);
    groups.set(signal.name, g);
  }
  return groups;
}

/** Accumulate feature importance values for a single signal's features. */
export function accumulateFeatures(
  featureMap: Map<string, { values: number[]; pnls: number[] }>,
  signal: AlphaSignal,
  pnl: number,
): void {
  for (const f of signal.features.features) {
    if (typeof f.value === 'number' && f.causal) {
      const entry = featureMap.get(f.id) ?? { values: [], pnls: [] };
      entry.values.push(f.value);
      entry.pnls.push(pnl);
      featureMap.set(f.id, entry);
    }
  }
}
