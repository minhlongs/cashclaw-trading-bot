// Barrel for the relative-value (pair spread) research module.
// Required by the knip entry glob `src/tree/**/index.ts`.

export type {
  PairDefinition,
  PairPanel,
  SpreadStateAtTime,
  PairSimConfig,
  PairPositionState,
  PairPeriodRecord,
  PairValidationEntry,
  PairSimResult,
} from './types';

export type { HedgeRatioEstimate, HedgeRatioFailure, HedgeRatioResult } from './hedge-ratio';
export {
  estimateRollingHedgeRatio,
  HEDGE_RATIO_REASONS,
} from './hedge-ratio';

export { buildSpreadSeries, SPREAD_REASONS } from './spread';

export {
  nextPosition,
  validateEntryExitConfig,
  POSITION_FLAT,
  POSITION_LONG,
  POSITION_SHORT,
} from './entry-exit';

export { runPairSpreadSim } from './simulator';


export type {
  TradabilityGateConfig,
  PairValidationDiagnostics,
  PairValidationResult,
} from './validation';
export { validatePairTradable, VALIDATION_REASONS } from './validation';

export type {
  PairStabilityConfig,
  PairStabilityComponents,
  PairStabilityResult,
} from './stability';
export { computePairStability, STABILITY_REASONS } from './stability';
