// D5 falsification verdict mapping (Phase 3). Maps IC evidence through the
// multiple-testing suite into a three-terminal verdict. Fail-closed
// conjunction mirroring evaluateSurvival: ANY failed check falsifies.
// Pure and deterministic: all randomness seeded via FNV-1a32(hypothesisId).

import {
  assessWalkForwardConsistency,
  bootstrapCi,
  ciExcludesZero,
  permutationTest,
} from '@/forest/alpha/multiple-testing';
import type { WalkForwardResult } from '@/forest/backtest/walkforward';
import type { ZooCheckResult, ZooVerdict } from './report-types';

/** FNV-1a32 hash of a string — deterministic seed derivation (no wall clock). */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Derive the statistical seed for one hypothesis (mirrors deriveSeedFromSpecId). */
export function deriveSeed(hypothesisId: string): number {
  return fnv1a32(hypothesisId);
}

/** Mean statistic shared by bootstrap + permutation checks. */
const mean = (values: readonly number[]): number =>
  values.reduce((sum, v) => sum + v, 0) / values.length;

/** Inputs to the D5 verdict mapping (all evidence pre-computed upstream). */
export interface VerdictInput {
  readonly hypothesisId: string;
  /** Valid (non-null) IC observations. */
  readonly icValues: readonly number[];
  /** Pooled forward returns aligned with `scores` (permutation test). */
  readonly pooledForwardReturns: readonly number[];
  /** Pooled point-in-time scores aligned with `pooledForwardReturns`. */
  readonly pooledScores: readonly number[];
  /** 6-window walk-forward shim built from IC-mean chunks. */
  readonly walkForward: WalkForwardResult;
}

/** Output of the D5 verdict mapping. */
export interface VerdictOutput {
  readonly verdict: ZooVerdict;
  readonly reasons: readonly string[];
  readonly checks: readonly ZooCheckResult[];
}

const BOOTSTRAP_ITERATIONS = 1000;
const BOOTSTRAP_CONFIDENCE = 0.95;
const PERMUTATION_ITERATIONS = 1000;
const SIGNIFICANCE_LEVEL = 0.05;
const MIN_POSITIVE_FRACTION = 0.6;
const MAX_SIGN_FLIPS = 3;

/**
 * D5 mapping: bootstrap CI excludes 0 AND permutation pValue < 0.05 AND
 * walk-forward consistency — all must pass (fail-closed conjunction).
 *
 * NOTE (escrow O-1): `permutationTest`'s statistic is the elementwise
 * `returns × signals` product (a covariance proxy), NOT Pearson IC. The
 * pooled global null also ignores panel structure — acceptable research
 * triage, disclosed in report meta.
 */
export function mapVerdict(input: VerdictInput): VerdictOutput {
  const seed = deriveSeed(input.hypothesisId);
  const checks: ZooCheckResult[] = [];

  const ci = bootstrapCi(input.icValues, mean, {
    iterations: BOOTSTRAP_ITERATIONS,
    confidence: BOOTSTRAP_CONFIDENCE,
    seed,
  });
  const bootstrapPassed = ciExcludesZero(ci);
  checks.push({
    check: 'bootstrap_ic_ci',
    passed: bootstrapPassed,
    detail: `CI [${ci.lower.toFixed(6)}, ${ci.upper.toFixed(6)}] ${bootstrapPassed ? 'excludes' : 'includes'} 0`,
  });

  const perm = permutationTest(input.pooledForwardReturns, input.pooledScores, mean, {
    iterations: PERMUTATION_ITERATIONS,
    seed,
  });
  const permutationPassed = perm.pValue < SIGNIFICANCE_LEVEL;
  checks.push({
    check: 'permutation',
    passed: permutationPassed,
    detail: `pValue ${perm.pValue.toFixed(4)} ${permutationPassed ? '<' : '>='} ${SIGNIFICANCE_LEVEL}`,
  });

  const wf = assessWalkForwardConsistency(input.walkForward, {
    minPositiveFraction: MIN_POSITIVE_FRACTION,
    maxSignFlips: MAX_SIGN_FLIPS,
  });
  checks.push({
    check: 'ic_walk_forward_consistency',
    passed: wf.consistent,
    detail: `positiveFraction ${wf.positiveFraction.toFixed(3)}, signFlips ${wf.signFlips}`,
  });

  const failures = checks.filter((c) => !c.passed);
  if (failures.length === 0) {
    return { verdict: 'ALIVE_FOR_FURTHER_RESEARCH', reasons: [], checks };
  }
  return {
    verdict: 'FALSIFIED',
    reasons: failures.map((f) => `${f.check}: ${f.detail}`),
    checks,
  };
}
