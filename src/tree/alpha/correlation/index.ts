// Barrel export for the correlation & pairs trading module.

export type {
  PairStats,
  PairSignal,
  GeneratePairSignalsOptions,
  MultiPairScanConfig,
  MultiPairScanResult,
} from './types';

export {
  pearsonCorrelation,
  computePairCorrelation,
  computeRollingCorrelation,
  computeSpreadStatistics,
} from './compute';

export { testCointegration } from './adf';

export {
  findCointegratedPairs,
  generatePairSignals,
  filterDiversified,
  scanMultiPairUniverse,
} from './pairs';
