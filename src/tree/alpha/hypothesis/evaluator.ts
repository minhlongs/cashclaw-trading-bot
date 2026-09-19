// Hypothesis Engine — Evaluator
// Evaluates a hypothesis against historical candle data.
// Pipeline: run indicators on full candle array → combine → label → metrics.

export {
  DIRECTION_RULES,
  inferDirection,
  defaultDirection,
} from './evaluator-direction';
export type { DirectionRule } from './evaluator-direction';
export {
  evaluateHypothesis,
  buildAlphaSignal,
  numericValue,
  classifyRegimeAt,
  empty,
} from './evaluator-core';
