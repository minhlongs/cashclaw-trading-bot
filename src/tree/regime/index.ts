// Regime module — barrel export

export { RegimeLabel } from './types';
export type {
  RegimeFeatures,
  RegimeResult,
  RegimeConfig,
  RegimeClassifier,
  RegimeHistory,
} from './types';

export { extractRegimeFeatures } from './features';
export { RuleBasedRegimeClassifier } from './classifier';

export { buildTransitionMatrix, alphaDecayByRegime, REGIME_LABELS } from './transition-matrix';
export type { TransitionMatrix } from './transition-matrix';
