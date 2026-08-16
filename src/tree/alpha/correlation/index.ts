// Barrel export for the correlation & pairs trading module.

export type { PairStats, PairSignal } from './types';

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
} from './pairs';
