// Pair discovery, signal generation, and diversification filtering for pairs trading.

export { causalSlice } from './pairs-utils';
export { findCointegratedPairs } from './pairs-discovery';
export {
  generatePairSignals,
  filterDiversified,
  scanMultiPairUniverse,
} from './pairs-signals';
