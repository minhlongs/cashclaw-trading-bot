// IC metric primitives (Phase 3, D4): Pearson IC, average-tie ranks,
// Spearman rankIC, summary stats, rolling sign-consistency stability, and
// regime-conditioned grouping. Pure, deterministic — no I/O, no randomness.
//
// CAUSALITY NOTE (binding): every IC here correlates point-in-time scores
// with FORWARD returns — future data by definition. IC is therefore an
// EVALUATION metric only (how well past scores predicted realized returns);
// it must never be used for signal construction.

export {
  pearson,
  averageTieRanks,
  spearman,
  meanStd,
  icInformationRatio,
} from './ic-metrics-core';
export {
  signConsistencyStability,
  regimeIcBreakdown,
} from './ic-metrics-stability';
export type { RegimeIcSummary } from './ic-metrics-stability';
