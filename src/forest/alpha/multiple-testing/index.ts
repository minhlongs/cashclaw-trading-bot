// Multiple-Testing Defense — Barrel Export
// knip entry glob covers `src/tree/**/index.ts` only; this forest barrel
// follows the established convention: if knip flags it, add to
// `knip.json` `ignoreFiles` alongside the existing forest persistence files.
// Only exports consumed by production code (verdict.ts) are re-exported here.
// Tests import directly from individual modules.

export {
  bootstrapCi,
  ciExcludesZero,
} from './bootstrap';

export {
  permutationTest,
} from './permutation-baseline';

export {
  assessWalkForwardConsistency,
} from './walk-forward-consistency';

export type {
  BootstrapCiResult,
  BootstrapOptions,
  StatFn,
  PermutationOptions,
  PermutationTestResult,
  WalkForwardConsistencyOptions,
  WalkForwardConsistencyVerdict,
} from './types';