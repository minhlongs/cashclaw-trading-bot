// Public Apache-2.0 SDK Barrel for @cashclaw/quantlib (Step 6)
// Pure zero-I/O quantitative estimators & strategy primitives.

export const QUANTLIB_OSS_VERSION = '1.62.0-open-core' as const;
export const QUANTLIB_LICENSE = 'Apache-2.0' as const;

export {
  volatilityDca,
  grid,
  meanReversion,
  quantFunctions,
  type QuantLibContext,
  type QuantResult,
  type QuantFn,
} from './index';

export { CorwinSchultzEngine } from './microstructure/corwin-schultz-engine';
export type {
  CorwinSchultzConfig,
  CorwinSchultzResult,
  HighLowBar,
} from './microstructure/corwin-schultz-types';

export { AbdiRanaldoEngine } from './microstructure/abdi-ranaldo-engine';
export type {
  AbdiRanaldoConfig,
  AbdiRanaldoResult,
  CloseHighLowBar,
} from './microstructure/abdi-ranaldo-types';

export { LesmondLotEngine } from './liquidity/lesmond-lot-engine';
export type { LesmondLotConfig, LesmondLotResult } from './liquidity/lesmond-lot-types';

export { PastorStambaughEngine } from './liquidity/pastor-stambaugh-engine';
export type {
  PastorStambaughConfig,
  PastorStambaughResult,
  PastorStambaughObservation,
} from './liquidity/pastor-stambaugh-types';

export { GarmanKlassVolatilityEngine } from './volatility/garman-klass-volatility-engine';
export type {
  OhlcBar,
  GarmanKlassConfig,
  GarmanKlassResult,
} from './volatility/garman-klass-volatility-types';

export { ParkinsonVolatilityEngine } from './volatility/parkinson-volatility-engine';
export { YangZhangVolatilityEngine } from './volatility/yang-zhang-volatility-engine';
export { RogersSatchellEngine } from './volatility/rogers-satchell-engine';
export { BessembinderKaufmanEngine } from './microstructure/bessembinder-kaufman-engine';
