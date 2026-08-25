// Regime transition matrix — statistics for regime sequences
// Builds P(regime[t+1] | regime[t]) from consecutive observed pairs only.
//
// KNOWN SIMPLIFICATION (plan gate C1): mission §5 wants
// P(regime[t+1] | regime[t], features[t]) but RegimeResult carries no feature
// vector, so this computes P(regime[t+1] | regime[t]).

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

interface MetricPoint {
  readonly regime: RegimeLabel;
  readonly value: number;
}

function labelIndex(label: RegimeLabel): number {
  return REGIME_LABELS.indexOf(label);
}

function makeZeroMatrix(size: number): number[][] {
  return Array.from({ length: size }, () => new Array<number>(size).fill(0));
}

function makeEmptyRecord(): Record<RegimeLabel, number> {
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

/**
 * Compute alpha decay per regime. For each regime, fits an exponential
 * decay to the metric values observed during that regime's runs,
 * returning the decay rate λ where value ≈ value₀ · e^(-λt).
 *
 * Returns 0 for regimes with fewer than 2 observations.
 */
export function alphaDecayByRegime(
  metricSeries: readonly MetricPoint[],
): Record<RegimeLabel, number> {
  const result = makeEmptyRecord();

  const byRegime = new Map<RegimeLabel, number[]>();
  for (const point of metricSeries) {
    const arr = byRegime.get(point.regime) ?? [];
    arr.push(point.value);
    byRegime.set(point.regime, arr);
  }

  for (const label of REGIME_LABELS) {
    const values = byRegime.get(label);
    if (!values || values.length < 2) {
      result[label] = 0;
      continue;
    }

    const first = values[0];
    const last = values[values.length - 1];
    if (first <= 0 || last <= 0) {
      result[label] = 0;
      continue;
    }

    const t = values.length - 1;
    const ratio = last / first;
    result[label] = -Math.log(ratio) / t;
  }

  return result;
}
