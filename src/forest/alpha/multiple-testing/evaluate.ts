// Multiple-Testing Defense — Survival Evaluation
// The ONLY place a research job earns SURVIVED. Combines every mission §9
// safeguard into one fail-closed conjunction: bootstrap CI excluding zero,
// permutation significance, random-entry superiority, walk-forward
// consistency, PBO ceiling, and cross-asset consistency. ANY failed check
// falsifies the job — a single lucky OOS window is structurally insufficient.
//
// Pure and deterministic: all randomness is seeded by the caller.

import { bootstrapCi, ciExcludesZero } from './bootstrap';
import { compareAgainstRandomEntry, permutationTest } from './permutation-baseline';
import { assessWalkForwardConsistency } from './walk-forward-consistency';
import { assessCrossAssetConsistency } from './cross-asset-consistency';
import { pboProxy } from './overfitting-proxy';
import type { SurvivalEvaluationInput, SurvivalVerdict } from './types';

/** Default permutation significance level (5%). */
export const DEFAULT_SIGNIFICANCE_LEVEL = 0.05;

/** One failed check with its human-readable reason. */
interface CheckFailure {
  readonly check: string;
  readonly reason: string;
}

function checkBootstrap(
  input: SurvivalEvaluationInput,
): CheckFailure | null {
  const mean = (values: readonly number[]): number =>
    values.reduce((sum, v) => sum + v, 0) / values.length;
  const ci = bootstrapCi(input.tradeReturns, mean, input.bootstrap);
  if (!ciExcludesZero(ci)) {
    return {
      check: 'bootstrap_ci',
      reason: `expectancy CI [${ci.lower.toFixed(6)}, ${ci.upper.toFixed(6)}] includes 0`,
    };
  }
  return null;
}

function checkPermutation(
  input: SurvivalEvaluationInput,
  significanceLevel: number,
): CheckFailure | null {
  const mean = (values: readonly number[]): number =>
    values.reduce((sum, v) => sum + v, 0) / values.length;
  const perm = permutationTest(
    input.strategyReturns,
    input.entrySignals,
    mean,
    input.permutation,
  );
  const baseline = compareAgainstRandomEntry(
    input.report,
    input.baselineReport,
    input.randomEntryOptions,
  );
  if (perm.pValue >= significanceLevel) {
    return {
      check: 'permutation',
      reason: `permutation pValue ${perm.pValue.toFixed(4)} >= significance ${significanceLevel}`,
    };
  }
  if (!baseline.passes) {
    return { check: 'random_entry', reason: baseline.reason };
  }
  return null;
}

function checkConsistency(
  input: SurvivalEvaluationInput,
): CheckFailure[] {
  const failures: CheckFailure[] = [];
  const wf = assessWalkForwardConsistency(input.walkForward, input.walkForwardOptions);
  if (!wf.consistent) {
    failures.push({
      check: 'walk_forward_consistency',
      reason: `positiveFraction ${wf.positiveFraction.toFixed(3)} or signFlips ${wf.signFlips} outside thresholds`,
    });
  }
  const cross = assessCrossAssetConsistency(
    input.crossAssetReports,
    input.crossAssetOptions,
  );
  if (!cross.consistent) {
    failures.push({
      check: 'cross_asset_consistency',
      reason: `${cross.assetsPassed}/${cross.assetsTested} assets positive (fraction ${cross.positiveFraction.toFixed(3)})`,
    });
  }
  return failures;
}

function checkOverfitting(
  input: SurvivalEvaluationInput,
): CheckFailure | null {
  const pbo = pboProxy(input.configMatrix);
  if (pbo.pbo > input.maxPbo) {
    return {
      check: 'pbo_proxy',
      reason: `PBO proxy ${pbo.pbo.toFixed(3)} exceeds ceiling ${input.maxPbo}`,
    };
  }
  return null;
}

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
