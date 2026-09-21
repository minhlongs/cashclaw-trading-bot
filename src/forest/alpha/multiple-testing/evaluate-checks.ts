import { bootstrapCi, ciExcludesZero } from './bootstrap';
import { compareAgainstRandomEntry, permutationTest } from './permutation-baseline';
import { assessWalkForwardConsistency } from './walk-forward-consistency';
import { assessCrossAssetConsistency } from './cross-asset-consistency';
import { pboProxy } from './overfitting-proxy';
import type { SurvivalEvaluationInput } from './types';

export interface CheckFailure {
  readonly check: string;
  readonly reason: string;
}

export function checkBootstrap(
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

export function checkPermutation(
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

export function checkConsistency(
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

export function checkOverfitting(
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
