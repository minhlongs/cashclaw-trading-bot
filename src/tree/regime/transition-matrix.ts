// Regime transition matrix — thin backward-compatible facade.
// Logic lives in co-located submodules.

export { REGIME_LABELS, type TransitionMatrix, buildTransitionMatrix } from './transition-matrix-builder';
export { alphaDecayByRegime } from './transition-decay';
