// Exponential alpha decay estimator by regime.

import { RegimeLabel } from './types';
import { REGIME_LABELS, makeEmptyRecord } from './transition-matrix-builder';

interface MetricPoint {
  readonly regime: RegimeLabel;
  readonly value: number;
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
