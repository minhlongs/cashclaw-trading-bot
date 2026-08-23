// Multiple-Testing Defense — Barrel Export
// knip entry glob covers `src/tree/**/index.ts` only; this forest barrel
// follows the established convention: if knip flags it, add to
// `knip.json` `ignoreFiles` alongside the existing forest persistence files.

export {
  mulberry32,
  shuffleInPlace,
} from './seeded-prng';

export {
  bootstrapCi,
  ciExcludesZero,
} from './bootstrap';

export {
  permutationTest,
  compareAgainstRandomEntry,
} from './permutation-baseline';

export {
  assessWalkForwardConsistency,
} from './walk-forward-consistency';

export {
  assessCrossAssetConsistency,
} from './cross-asset-consistency';

export {
  pboProxy,
  parameterSensitivity,
} from './overfitting-proxy';

export {
  computeCounters,
  incrementForJob,
  emptyCounters,
} from './counters';

export {
  evaluateSurvival,
} from './evaluate';

export type {
  MultipleTestingCounters,
  BootstrapCiResult,
  BootstrapOptions,
  StatFn,
  PermutationOptions,
  PermutationTestResult,
  RandomEntryComparisonOptions,
  RandomEntryVerdict,
  WalkForwardConsistencyOptions,
  WalkForwardConsistencyVerdict,
  CrossAssetConsistencyOptions,
  CrossAssetConsistencyVerdict,
  CounterKnownSets,
  SurvivalEvaluationInput,
  SurvivalVerdict,
} from './types';

export type {
  PboProxyResult,
  ParameterSensitivityOptions,
  ParameterSensitivityResult,
  GridResult,
  OverfittingReport,
} from './overfitting-types';