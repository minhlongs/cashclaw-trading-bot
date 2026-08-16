// Alpha Lab — barrel export
export type {
  AlphaSource,
  AlphaDirection,
  Feature,
  FeatureVector,
  AlphaSignal,
  AlphaConfig,
  AlphaResult,
  AlphaSymbolResult,
  CombinerMethod,
  AlphaCombinerConfig,
  AlphaCompositeResult,
} from './types';

export type { BarrierConfig, BarrierLabel, LabeledEvent } from './labeling';
export { labelEvent } from './labeling';
export { combineSignals } from './combiner';
