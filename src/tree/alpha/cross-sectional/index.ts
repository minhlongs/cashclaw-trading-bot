// Barrel export for the cross-sectional simulation module.

export type {
  AssetReturnSeries,
  WeighterFn,
  CrossSectionalSimConfig,
  RebalanceRecord,
  CrossSectionalSimResult,
  BetaTiltResult,
} from './types';

export { computeTurnover, sumTurnover } from './turnover';

export { runCrossSectionalSim } from './simulator';

export type { BetaScaleConfig, BetaScaleResult } from './beta-sizing';

export {
  estimateRollingBetas,
  scaleWeightsToTargetBeta,
} from './beta-sizing';

export { inverseBetaTilt } from './beta-tilt';
