// Alpha Attribution Engine — analyzer
// Computes per-alpha performance attribution, regime breakdown, and feature importance.

import type { AttributionResult } from './types';
import type { AlphaSignal } from '@/tree/alpha/types';
import type { BacktestTrade } from '@/forest/backtest/types';
import { RegimeLabel } from '@/tree/regime/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i] - mx;
    const yi = y[i] - my;
    num += xi * yi;
    dx += xi * xi;
    dy += yi * yi;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

function emptyRegimeBreakdown(): Record<RegimeLabel, { trades: number; pnl: number; winRate: number }> {
  const out: Partial<Record<RegimeLabel, { trades: number; pnl: number; winRate: number }>> = {};
  for (const label of Object.values(RegimeLabel)) {
    out[label] = { trades: 0, pnl: 0, winRate: 0 };
  }
  return out as Record<RegimeLabel, { trades: number; pnl: number; winRate: number }>;
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Attribute performance across alpha signals.
 *
 * @param trades   All trades from the experiment run.
 * @param signals  All alpha signals emitted during the experiment.
 * @param regimes  Per-candle regime observations (timestamp + label).
 * @returns Per-alpha AttributionResult[], sorted by totalContribution descending.
 */
export function attributePerformance(
  trades: BacktestTrade[],
  signals: AlphaSignal[],
  regimes: { timestamp: number; label: RegimeLabel }[],
): AttributionResult[] {
  if (signals.length === 0) return [];

  const sortedSignals = [...signals].sort((a, b) => a.timestamp - b.timestamp);
  const sortedRegimes = [...regimes].sort((a, b) => a.timestamp - b.timestamp);

  // Build regime lookup: for any timestamp, find the latest regime
  const regimeLookup = new Map<number, RegimeLabel>();
  for (const r of sortedRegimes) {
    regimeLookup.set(r.timestamp, r.label);
  }

  function regimeAt(ts: number): RegimeLabel {
    let result = RegimeLabel.UNKNOWN;
    for (const [t, label] of regimeLookup) {
      if (t <= ts) result = label;
      else break;
    }
    return result;
  }

  // Match each trade to the latest signal that preceded its entry
  const matched = new Map<string, { trade: BacktestTrade; signal: AlphaSignal }>();
  for (const trade of trades) {
    // Find rightmost signal with timestamp <= trade.entryTimestamp
    let lo = 0;
    let hi = sortedSignals.length - 1;
    let best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sortedSignals[mid].timestamp <= trade.entryTimestamp) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    matched.set(`${trade.entryTimestamp}-${trade.exitTimestamp}`, { trade, signal: sortedSignals[best] });
  }

  // Group by signal name
  const groups = new Map<string, { trades: BacktestTrade[]; signals: AlphaSignal[] }>();
  for (const { trade, signal } of matched.values()) {
    const g = groups.get(signal.name) ?? { trades: [], signals: [] };
    g.trades.push(trade);
    g.signals.push(signal);
    groups.set(signal.name, g);
  }

  const results: AttributionResult[] = [];

  for (const [alphaId, group] of groups) {
    const { trades: gTrades, signals: gSignals } = group;

    let totalContribution = 0;
    let winsContribution = 0;
    let lossesContribution = 0;
    const regimeBreakdown = emptyRegimeBreakdown();
    const confidenceSum = gSignals.reduce((a, s) => a + s.confidence, 0);
    const durations: number[] = [];
    const featureMap = new Map<string, { values: number[]; pnls: number[] }>();

    for (let i = 0; i < gTrades.length; i++) {
      const trade = gTrades[i];
      const p = trade.pnl;
      totalContribution += p;
      if (p >= 0) winsContribution += p; else lossesContribution += p;
      durations.push(trade.holdingMinutes);

      // Regime at entry
      const regime = regimeAt(trade.entryTimestamp);
      const rb = regimeBreakdown[regime];
      rb.trades += 1;
      rb.pnl += p;
      const winsBefore = rb.winRate * (rb.trades - 1);
      rb.winRate = p >= 0 ? (winsBefore + 1) / rb.trades : winsBefore / rb.trades;

      // Feature importance
      const signal = gSignals[i];
      for (const f of signal.features.features) {
        if (typeof f.value === 'number' && f.causal) {
          const entry = featureMap.get(f.id) ?? { values: [], pnls: [] };
          entry.values.push(f.value);
          entry.pnls.push(p);
          featureMap.set(f.id, entry);
        }
      }
    }

    const FeatureImportance: Record<string, number> = {};
    for (const [name, entry] of featureMap) {
      FeatureImportance[name] = pearson(entry.values, entry.pnls);
    }

    results.push({
      alphaId,
      totalContribution,
      winsContribution,
      lossesContribution,
      RegimeBreakdown: regimeBreakdown,
      FeatureImportance,
      AvgConfidence: gSignals.length > 0 ? confidenceSum / gSignals.length : 0,
      avgDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    });
  }

  return results.sort((a, b) => b.totalContribution - a.totalContribution);
}