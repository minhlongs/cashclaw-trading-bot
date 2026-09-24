// Multiple-Testing Defense — Permutation Test Core
// Fisher–Yates seeded shuffle builds a null distribution of the statistic;
// a real edge must beat it. Pure and deterministic: shuffle order is fully
// determined by the seed.

import { mulberry32, shuffleInPlace } from './seeded-prng';
import type { PermutationOptions, PermutationTestResult } from './types';
import type { StatFn } from './bootstrap';

function validatePermutationInput(
  strategyReturns: readonly number[],
  entrySignals: readonly number[],
  options: PermutationOptions,
): void {
  if (strategyReturns.length < 2) {
    throw new Error(
      `permutationTest requires at least 2 returns, got ${strategyReturns.length}`,
    );
  }
  if (strategyReturns.length !== entrySignals.length) {
    throw new Error(
      `permutationTest requires aligned arrays: ${strategyReturns.length} returns vs ${entrySignals.length} signals`,
    );
  }
  if (!Number.isInteger(options.iterations) || options.iterations < 1) {
    throw new Error(
      `permutationTest requires iterations >= 1, got ${options.iterations}`,
    );
  }
  if (!Number.isFinite(options.seed)) {
    throw new Error('permutationTest requires a finite numeric seed');
  }
}

/** Element-wise alignment of returns with signals (position-weighted). */
function alignedSeries(
  strategyReturns: readonly number[],
  signals: readonly number[],
): number[] {
  return strategyReturns.map((r, i) => r * signals[i]);
}

/**
 * Permutation test of the return<->signal alignment.
 *
 * The observed statistic is computed on the aligned series
 * (returns x signals). Each permutation shuffles the signal alignment
 * (Fisher–Yates, seeded) and recomputes the statistic on the broken
 * alignment. `pValue` is the fraction of permutations whose statistic is
 * >= the observed one (fail-closed: ties count against the strategy, so
 * an indistinguishable strategy yields pValue near 1).
 */
export function permutationTest(
  strategyReturns: readonly number[],
  entrySignals: readonly number[],
  statFn: StatFn,
  options: PermutationOptions,
): PermutationTestResult {
  validatePermutationInput(strategyReturns, entrySignals, options);

  const observed = statFn(alignedSeries(strategyReturns, entrySignals));
  if (!Number.isFinite(observed)) {
    throw new Error('permutationTest statistic returned a non-finite value');
  }

  const rng = mulberry32(options.seed);
  const shuffled = [...entrySignals];
  let sum = 0;
  let sumSq = 0;
  let atLeastObserved = 0;

  for (let iter = 0; iter < options.iterations; iter++) {
    shuffleInPlace(shuffled, rng);
    const stat = statFn(alignedSeries(strategyReturns, shuffled));
    sum += stat;
    sumSq += stat * stat;
    if (stat >= observed) atLeastObserved += 1;
  }

  const nullMean = sum / options.iterations;
  const variance = Math.max(sumSq / options.iterations - nullMean * nullMean, 0);

  return {
    observed,
    nullMean,
    nullStd: Math.sqrt(variance),
    pValue: atLeastObserved / options.iterations,
    iterations: options.iterations,
  };
}
