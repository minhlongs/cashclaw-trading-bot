// Multiple-Testing Defense — Survival Evaluation
// The ONLY place a research job earns SURVIVED. Combines every mission §9
// safeguard into one fail-closed conjunction: bootstrap CI excluding zero,
// permutation significance, random-entry superiority, walk-forward
// consistency, PBO ceiling, and cross-asset consistency. ANY failed check
// falsifies the job — a single lucky OOS window is structurally insufficient.
//
// Pure and deterministic: all randomness is seeded by the caller.

import type { SurvivalEvaluationInput, SurvivalVerdict } from './types';
import {
  type CheckFailure,
  checkBootstrap,
  checkPermutation,
  checkConsistency,
  checkOverfitting,
} from './evaluate-checks';

/** Default permutation significance level (5%). */
export const DEFAULT_SIGNIFICANCE_LEVEL = 0.05;

/**
 * Combine all multiple-testing safeguards into one survival verdict.
 *
 * Checks (all must pass — fail closed):
 * 1. bootstrap CI of per-trade returns excludes 0;
 * 2. permutation test significant below the significance level;
 * 3. strategy beats the random_entry baseline on expectancy net of costs;
 * 4. walk-forward OOS windows are consistent;
 * 5. cross-asset consistency meets breadth + positive-fraction thresholds;
 * 6. PBO proxy at or below the configured ceiling.
 */
export function evaluateSurvival(
  input: SurvivalEvaluationInput,
): SurvivalVerdict {
  const significanceLevel =
    input.significanceLevel ?? DEFAULT_SIGNIFICANCE_LEVEL;

  const failures: CheckFailure[] = [];
  const push = (failure: CheckFailure | null): void => {
    if (failure) failures.push(failure);
  };

  push(checkBootstrap(input));
  push(checkPermutation(input, significanceLevel));
  failures.push(...checkConsistency(input));
  push(checkOverfitting(input));

  return {
    verdict: failures.length === 0 ? 'survived' : 'falsified',
    reasons: failures.map((f) => `${f.check}: ${f.reason}`),
  };
}
