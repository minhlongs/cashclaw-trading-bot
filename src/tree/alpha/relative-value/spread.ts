// Causal spread + z-score series construction for pair research.
// Pure, deterministic — no I/O, no network, no Math.random/Date.now.
//
// Causality contract (ESCROW-CRITICAL, do not "simplify"):
//   β(t) is estimated as-of decision timestamp t using ONLY closes with
//   timestamp < t. The spread value attributed to index j is
//     s(j) = closesB[j] − β(timestamps[j+1]) · closesA[j]
//   i.e. it uses the β estimated strictly before the NEXT timestamp, so s(j)
//   consumes no data beyond index j. The z-score at t standardises s(t−1)
//   against the trailing zWindow spread values ending at t−1 — every input
//   carries timestamp < t. Never forward-fill, never carry a stale β.

import {
  estimateRollingHedgeRatio,
  type HedgeRatioResult,
} from './hedge-ratio';
import type { PairPanel, PairSimConfig, SpreadStateAtTime } from './types';
import { assertPositiveCloses } from './pair-period';

/** Distinct fail-closed reasons (tested verbatim). */
export const SPREAD_REASONS = {
  hedgeRatioUnavailable: 'hedge ratio unavailable',
  insufficientSpreadHistory: 'insufficient spread history for z window',
  spreadUnavailable: 'spread value unavailable within z window',
  zeroSpreadStd: 'spread standard deviation is zero in z window',
} as const;

function mean(values: readonly number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stdDev(values: readonly number[]): number {
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

function degenerate(
  timestamp: number,
  reason: string,
): SpreadStateAtTime {
  return { timestamp, hedgeRatio: null, spread: null, zScore: null, reason };
}

/** State where β (and maybe the latest spread) exist but z does not yet. */
function partial(
  timestamp: number,
  hedgeRatio: number,
  spread: number | null,
  reason: string,
): SpreadStateAtTime {
  return { timestamp, hedgeRatio, spread, zScore: null, reason };
}

/** β(k) estimated as-of timestamps[k] using only strictly-prior closes. */
function estimateBetaSeries(
  panel: PairPanel,
  config: PairSimConfig,
): HedgeRatioResult[] {
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
 * s(j) := closesB[j] − β(timestamps[j+1])·closesA[j]. The β here was made
 * strictly before timestamps[j+1], so s(j) reads nothing beyond index j.
 * Null whenever that β failed (no forward-fill).
 */
function spreadValues(
  panel: PairPanel,
  betaAt: readonly HedgeRatioResult[],
): Array<number | null> {
  const n = panel.timestamps.length;
  const spreads: Array<number | null> = [];
  for (let j = 0; j < n - 1; j++) {
    const beta = betaAt[j + 1]!;
    spreads.push(
      beta.hedgeRatio === null
        ? null
        : panel.closesB[j]! - beta.hedgeRatio * panel.closesA[j]!,
    );
  }
  return spreads;
}

/**
 * Build the causal spread/z-score series for every panel timestamp.
 * Each state preserves whatever is causally computable: hedgeRatio and the
 * latest spread survive even while the z-window is still warming up (their
 * fields stay independently nullable per SpreadStateAtTime). A state whose
 * hedge ratio itself is unavailable is fully degenerate (all-null + reason).
 * Nothing is ever forward-filled and no stale β is carried.
 */
export function buildSpreadSeries(
  panel: PairPanel,
  config: PairSimConfig,
): SpreadStateAtTime[] {
  const n = panel.timestamps.length;
  if (n !== panel.closesA.length || n !== panel.closesB.length) {
    throw new Error('buildSpreadSeries: panel array lengths differ');
  }
  assertPositiveCloses(panel, 'buildSpreadSeries');

  const betaAt = estimateBetaSeries(panel, config);
  const spreads = spreadValues(panel, betaAt);

  const out: SpreadStateAtTime[] = [];
  for (let k = 0; k < n; k++) {
    const t = panel.timestamps[k]!;
    const beta = betaAt[k]!;
    if (beta.hedgeRatio === null) {
      out.push(degenerate(t, `${SPREAD_REASONS.hedgeRatioUnavailable}: ${beta.reason}`));
      continue;
    }
    // Latest spread value ending at t−1 (null while none exists yet).
    const latest = k >= 1 ? spreads[k - 1] : null;
    const windowStart = k - config.zWindow;
    if (k - 1 < 0 || windowStart < 0) {
      out.push(partial(t, beta.hedgeRatio, latest, SPREAD_REASONS.insufficientSpreadHistory));
      continue;
    }
    const window = spreads.slice(windowStart, k);
    if (window.some((s) => s === null)) {
      out.push(partial(t, beta.hedgeRatio, latest, SPREAD_REASONS.spreadUnavailable));
      continue;
    }
    const values = window as number[];
    const sd = stdDev(values);
    if (sd === 0) {
      out.push(partial(t, beta.hedgeRatio, latest, SPREAD_REASONS.zeroSpreadStd));
      continue;
    }
    out.push({
      timestamp: t,
      hedgeRatio: beta.hedgeRatio,
      spread: values[values.length - 1]!,
      zScore: (values[values.length - 1]! - mean(values)) / sd,
    });
  }
  return out;
}
