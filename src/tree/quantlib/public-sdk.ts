// Public Apache-2.0 SDK Barrel for @cashclaw/quantlib (Step 6)
// Pure zero-I/O quantitative estimators & strategy primitives.

export const QUANTLIB_OSS_VERSION = '1.65.0-open-core' as const;
export const QUANTLIB_LICENSE = 'Apache-2.0' as const;

export {
  volatilityDca, grid, meanReversion, quantFunctions,
  type QuantLibContext, type QuantResult, type QuantFn,
} from './index';

export { CorwinSchultzEngine } from './microstructure/corwin-schultz-engine';
export type { CorwinSchultzConfig, CorwinSchultzResult, HighLowBar } from './microstructure/corwin-schultz-types';

export { AbdiRanaldoEngine } from './microstructure/abdi-ranaldo-engine';
export type { AbdiRanaldoConfig, AbdiRanaldoResult, ChlBar } from './microstructure/abdi-ranaldo-types';

export { LesmondLotEngine } from './liquidity/lesmond-lot-engine';
export type { LesmondLotConfig, LesmondLotResult } from './liquidity/lesmond-lot-types';

export { PastorStambaughEngine } from './liquidity/pastor-stambaugh-engine';
export type { PastorStambaughConfig, PastorStambaughResult, PastorStambaughBar } from './liquidity/pastor-stambaugh-types';

export { GarmanKlassVolatilityEngine } from './volatility/garman-klass-volatility-engine';
export type { OhlcBar, GarmanKlassConfig, GarmanKlassResult } from './volatility/garman-klass-volatility-types';

export { ParkinsonVolatilityEngine } from './volatility/parkinson-volatility-engine';
export { YangZhangVolatilityEngine } from './volatility/yang-zhang-volatility-engine';
export { RogersSatchellVolatilityEngine } from './volatility/rogers-satchell-engine';
export { BessembinderKaufmanEngine } from './microstructure/bessembinder-kaufman-engine';

export {
  AmihudIlliquidityEngine,
  type AmihudPriceVolumeBar, type AmihudIlliqConfig, type AmihudIlliqResult,
} from './liquidity/amihud-illiquidity-engine';

export {
  RollEffectiveSpreadEngine, computeRollSpread,
  type RollSpreadParams, type RollSpreadResult,
} from './microstructure/roll-effective-spread-engine';

export {
  computeHawkesIntensity, computeOrderBookImbalance,
  type HawkesParams, type HawkesIntensityResult, type OrderBookImbalanceResult,
} from './microstructure/hawkes-arrival-kernel';

export { GatheralRoughVolatilityEngine } from './volatility/gatheral-rough-volatility';
export { runBipowerJumpEstimation } from './volatility/bipower-jump-estimator';

export { HayashiYoshidaEngine } from './leadlag/hayashi-yoshida-engine';
export type { AsynchronousTick, HayashiYoshidaConfig, HayashiYoshidaResult } from './leadlag/hayashi-yoshida-types';

export {
  computeAlmgrenChrissTrajectory,
  type AlmgrenChrissParams, type AlmgrenChrissTrajectoryResult, type AlmgrenChrissSlice,
} from './execution/almgren-chriss-trajectory';

export {
  runHamiltonMarkovFilter,
  type HamiltonRegimeState, type HamiltonFilterParams, type HamiltonFilterStep, type HamiltonFilterResult,
} from './regime/hamilton-markov-filter';

export {
  computeHrpRecursiveBisection,
  type HrpAllocatorParams, type HrpAssetAllocation, type HrpAllocationResult,
} from './portfolio/hrp-recursive-bisection';

export {
  computeDupireMartingaleSurface,
  type DupireMotParams, type DupireStrikeNode, type DupireMotSurfaceResult,
} from './volatility/dupire-martingale-transport';

export {
  computeRoughPathLevySignature,
  type RoughPathLeadLagVerdict, type RoughPathLevyParams, type RoughPathSignatureStep, type RoughPathSignatureResult,
} from './signatures/rough-path-levy-area';

export { BlackLittermanEngine } from './portfolio/black-litterman-engine';
export { AvellanedaStoikovEngine } from './marketmaking/avellaneda-stoikov-engine';
export { computeBouchaudImpact } from './impact/bouchaud-propagator-engine';
export { KalmanCointegrationEngine } from './kalman/kalman-cointegration-engine';
