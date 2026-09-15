// Alpha Attribution Engine — analyzer orchestrator
// Computes per-alpha performance attribution, regime breakdown, and feature importance.

import type { AttributionResult } from './types';
import type { AlphaSignal } from '@/tree/alpha/types';
import type { BacktestTrade } from '@/forest/backtest/types';
import type { RegimeLabel } from '@/tree/regime/types';
import { buildRegimeLookup } from './regime';
import { matchTradesToSignals, groupByAlpha } from './signal-matching';
import { computeAlphaAttribution } from './alpha-attribution';

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
  const regimeLookup = buildRegimeLookup(regimes);
  const matched = matchTradesToSignals(trades, sortedSignals);
  const groups = groupByAlpha(matched);

  const results: AttributionResult[] = [];
  for (const [alphaId, group] of groups) {
    results.push(
      computeAlphaAttribution(alphaId, group.trades, group.signals, regimeLookup),
    );
  }

  return results.sort((a, b) => b.totalContribution - a.totalContribution);
}
