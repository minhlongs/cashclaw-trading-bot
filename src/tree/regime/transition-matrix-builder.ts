// Regime transition matrix builder — statistics for regime sequences
// Builds P(regime[t+1] | regime[t]) from consecutive observed pairs only.

import { RegimeLabel, type RegimeResult } from './types';

export const REGIME_LABELS: readonly RegimeLabel[] =
  Object.values(RegimeLabel) as RegimeLabel[];
const N = REGIME_LABELS.length;

export interface TransitionMatrix {
  readonly labels: readonly RegimeLabel[];
  readonly counts: readonly (readonly number[])[];
  readonly probabilities: readonly (readonly number[])[];
  readonly persistence: Record<RegimeLabel, number>;
  readonly entropy: Record<RegimeLabel, number>;
  readonly avgDuration: Record<RegimeLabel, number>;
  readonly hazard: Record<RegimeLabel, number>;
  readonly totalTransitions: number;
}

function labelIndex(label: RegimeLabel): number {
  return REGIME_LABELS.indexOf(label);
}

function makeZeroMatrix(size: number): number[][] {
  return Array.from({ length: size }, () => new Array<number>(size).fill(0));
}

export function makeEmptyRecord(): Record<RegimeLabel, number> {
  return Object.fromEntries(
    REGIME_LABELS.map((l) => [l, 0]),
  ) as Record<RegimeLabel, number>;
}

/**
 * Build a regime transition matrix from observed regime history.
 *
 * ONLY uses consecutive pairs (regime[t] → regime[t+1]) — causal by construction.
 *
 * KNOWN SIMPLIFICATION: mission §5 wants P(regime[t+1] | regime[t], features[t])
 * but RegimeResult carries no feature vector, so this computes
 * P(regime[t+1] | regime[t]).
 */
export function buildTransitionMatrix(
  history: readonly RegimeResult[],
): TransitionMatrix {
  const counts = makeZeroMatrix(N);
  let totalTransitions = 0;

  for (let i = 0; i < history.length - 1; i++) {
    const fromIdx = labelIndex(history[i].label);
    const toIdx = labelIndex(history[i + 1].label);
    counts[fromIdx][toIdx]++;
    totalTransitions++;
  }

  const probabilities = makeZeroMatrix(N);
  for (let i = 0; i < N; i++) {
    const rowSum = counts[i].reduce((a, b) => a + b, 0);
    if (rowSum > 0) {
      for (let j = 0; j < N; j++) {
        probabilities[i][j] = counts[i][j] / rowSum;
      }
    }
  }

  const persistence = makeEmptyRecord();
  for (let i = 0; i < N; i++) {
    persistence[REGIME_LABELS[i]] = probabilities[i][i];
  }

  const entropy = makeEmptyRecord();
  for (let i = 0; i < N; i++) {
    let h = 0;
    for (let j = 0; j < N; j++) {
      const p = probabilities[i][j];
      if (p > 0) {
        h -= p * Math.log2(p);
      }
    }
    entropy[REGIME_LABELS[i]] = h;
  }

  const durationSums = makeEmptyRecord();
  const durationCounts = makeEmptyRecord();
  for (const r of history) {
    durationSums[r.label] += r.duration;
    durationCounts[r.label]++;
  }

  const avgDuration = makeEmptyRecord();
  const hazard = makeEmptyRecord();
  for (const label of REGIME_LABELS) {
    const count = durationCounts[label];
    avgDuration[label] = count > 0 ? durationSums[label] / count : 0;
    hazard[label] = avgDuration[label] > 0 ? 1 / avgDuration[label] : 0;
  }

  return {
    labels: REGIME_LABELS,
    counts,
    probabilities,
    persistence,
    entropy,
    avgDuration,
    hazard,
    totalTransitions,
  };
}
