// Alpha Attribution Engine — per-alpha attribution

import type { AttributionResult } from './types';
import type { AlphaSignal } from '@/tree/alpha/types';
import type { BacktestTrade } from '@/forest/backtest/types';
import type { RegimeLabel } from '@/tree/regime/types';
import { emptyRegimeBreakdown, regimeAt } from './regime';
import { accumulateFeatures } from './signal-matching';
import { pearson } from './math';

/** Compute attribution for a single alpha group. */
export function computeAlphaAttribution(
  alphaId: string,
  gTrades: BacktestTrade[],
  gSignals: AlphaSignal[],
  regimeLookup: Map<number, RegimeLabel>,
): AttributionResult {
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
    const regime = regimeAt(trade.entryTimestamp, regimeLookup);
    const rb = regimeBreakdown[regime];
    rb.trades += 1;
    rb.pnl += p;
    const winsBefore = rb.winRate * (rb.trades - 1);
    rb.winRate = p >= 0 ? (winsBefore + 1) / rb.trades : winsBefore / rb.trades;

    // Feature importance
    accumulateFeatures(featureMap, gSignals[i], p);
  }

  const FeatureImportance: Record<string, number> = {};
  for (const [name, entry] of featureMap) {
    FeatureImportance[name] = pearson(entry.values, entry.pnls);
  }

  return {
    alphaId,
    totalContribution,
    winsContribution,
    lossesContribution,
    RegimeBreakdown: regimeBreakdown,
    FeatureImportance,
    AvgConfidence: gSignals.length > 0 ? confidenceSum / gSignals.length : 0,
    avgDuration: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
  };
}
