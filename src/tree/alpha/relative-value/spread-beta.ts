/**
 * Internal beta-estimation series helpers for pair spread construction.
 * Pure, deterministic — no I/O, no network, no Math.random/Date.now.
 *
 * All functions are module-private (consumed only by ./spread.ts).
 */

import {
  estimateRollingHedgeRatio,
  type HedgeRatioResult,
} from './hedge-ratio';
import type { PairPanel, PairSimConfig, SpreadStateAtTime } from './types';

export function mean(values: readonly number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function stdDev(values: readonly number[]): number {
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

export function degenerate(
  timestamp: number,
  reason: string,
): SpreadStateAtTime {
  return { timestamp, hedgeRatio: null, spread: null, zScore: null, reason };
}

/** State where β (and maybe the latest spread) exist but z does not yet. */
export function partial(
  timestamp: number,
  hedgeRatio: number,
  spread: number | null,
  reason: string,
): SpreadStateAtTime {
  return { timestamp, hedgeRatio, spread, zScore: null, reason };
}

/** β(k) estimated as-of timestamps[k] using only strictly-prior closes. */
export function estimateBetaSeries(
  panel: PairPanel,
  config: PairSimConfig,
): HedgeRatioResult[] {
  if (config.hedgeMode === 'frozen') return estimateFrozenBetaSeries(panel, config);
  const n = panel.timestamps.length;
  // Index 0 has no strictly-prior data → fail-closed placeholder.
  const betaAt: HedgeRatioResult[] = [
    {
      hedgeRatio: null,
      reason: 'no strictly-prior data at first timestamp',
    },
  ];
  for (let k = 1; k < n; k++) {
    betaAt.push(
      estimateRollingHedgeRatio(
        panel,
        config.hedgeWindow,
        config.minObs,
        panel.timestamps[k]!,
      ),
    );
  }
  return betaAt;
}

/**
 * Frozen-β series (hedgeMode 'frozen'): β is estimated ONCE at the FIRST
 * VALID timestamp (first estimate that succeeds) from strictly-prior closes
 * only, then held constant for every later timestamp. States before that
 * point stay fail-closed with their own reasons. Causality: the single
 * estimate consumes no data at or beyond its estimation point — it is never
 * recomputed or updated afterwards.
 */
function estimateFrozenBetaSeries(
  panel: PairPanel,
  config: PairSimConfig,
): HedgeRatioResult[] {
  const n = panel.timestamps.length;
  if (n < 2) {
    return [{ hedgeRatio: null, reason: 'no strictly-prior data at first timestamp' }];
  }
  const out: HedgeRatioResult[] = [
    { hedgeRatio: null, reason: 'no strictly-prior data at first timestamp' },
  ];
  let anchor: HedgeRatioResult | null = null;
  for (let k = 1; k < n; k++) {
    if (anchor === null) {
      const est = estimateRollingHedgeRatio(
        panel,
        config.hedgeWindow,
        config.minObs,
        panel.timestamps[k]!,
      );
      if (est.hedgeRatio === null) {
        out.push(est);
        continue;
      }
      anchor = est;
    }
    out.push(anchor);
  }
  return out;
}
