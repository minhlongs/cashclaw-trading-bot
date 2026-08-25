// Multiple-Testing Defense — Percentile Bootstrap CI
// Resamples a value series with replacement and reports a percentile
// confidence interval for an arbitrary statistic. Pure and deterministic:
// the resampling order is fully determined by the explicit seed.
//
// Fail-closed: insufficient data or invalid options throw — a CI is never
// silently widened or skipped.

import { mulberry32 } from './seeded-prng';
import type { BootstrapCiResult, BootstrapOptions } from './types';

/** A statistic computed over a sample (e.g. mean expectancy). */
export type StatFn = (values: readonly number[]) => number;

function validateBootstrapInput(
  values: readonly number[],
  options: BootstrapOptions,
): void {
  if (values.length < 2) {
    throw new Error(
      `bootstrapCi requires at least 2 values, got ${values.length}`,
    );
  }
  if (!Number.isInteger(options.iterations) || options.iterations < 1) {
    throw new Error(
      `bootstrapCi requires iterations >= 1, got ${options.iterations}`,
    );
  }
  if (!(options.confidence > 0) || !(options.confidence < 1)) {
    throw new Error(
      `bootstrapCi requires confidence in (0, 1), got ${options.confidence}`,
    );
  }
  if (!Number.isFinite(options.seed)) {
    throw new Error('bootstrapCi requires a finite numeric seed');
  }
}

/** Percentile index (clamped to the sample range) for a quantile. */
function percentileIndex(count: number, quantile: number): number {
  const idx = Math.floor(quantile * count);
  return Math.min(Math.max(idx, 0), count - 1);
}

/**
 * Percentile bootstrap confidence interval.
 *
 * - `point` is the statistic on the full sample.
 * - `lower`/`upper` are the percentile bounds of the resampled statistic
 *   distribution at the requested confidence level.
 * - A constant series collapses to a point CI (lower === point === upper).
 *
 * Throws on fewer than 2 values, fewer than 1 iteration, or a confidence
 * level outside (0, 1) — never returns a silent pass.
 */
export function bootstrapCi(
  values: readonly number[],
  statFn: StatFn,
  options: BootstrapOptions,
): BootstrapCiResult {
  validateBootstrapInput(values, options);

  const point = statFn(values);
  if (!Number.isFinite(point)) {
    throw new Error('bootstrapCi statistic returned a non-finite value');
  }

  const rng = mulberry32(options.seed);
  const n = values.length;
  const stats: number[] = new Array(options.iterations);
  const sample: number[] = new Array(n);

  for (let iter = 0; iter < options.iterations; iter++) {
    for (let i = 0; i < n; i++) {
      sample[i] = values[Math.floor(rng() * n)];
    }
    stats[iter] = statFn(sample);
  }

  stats.sort((a, b) => a - b);
  const alpha = (1 - options.confidence) / 2;
  const lower = stats[percentileIndex(options.iterations, alpha)];
  const upper = stats[percentileIndex(options.iterations, 1 - alpha)];

  return { lower, point, upper, iterations: options.iterations };
}

/** True when the CI strictly excludes zero (positive or negative side). */
export function ciExcludesZero(ci: BootstrapCiResult): boolean {
  return ci.lower > 0 || ci.upper < 0;
}
