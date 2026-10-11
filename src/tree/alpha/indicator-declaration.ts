import type { FeatureSource, FeatureAvailability } from './indicator-candle-types';

export interface FeatureDeclaration {
  readonly name: string;
  readonly timeframe: string;
  readonly source: FeatureSource;
  readonly lookback: number;
  readonly availability: FeatureAvailability;
  readonly causal: boolean;
}

export function declareFeature(d: FeatureDeclaration): FeatureDeclaration {
  if (!d.name || typeof d.name !== 'string') {
    throw new Error('feature declaration requires a non-empty name');
  }
  if (!d.timeframe || typeof d.timeframe !== 'string') {
    throw new Error(`feature '${d.name}' requires a timeframe`);
  }
  if (typeof d.lookback !== 'number' || d.lookback < 0 || !Number.isFinite(d.lookback)) {
    throw new Error(`feature '${d.name}' requires a non-negative finite lookback`);
  }
  if (!d.availability) {
    throw new Error(`feature '${d.name}' requires an availability`);
  }
  if (typeof d.causal !== 'boolean') {
    throw new Error(`feature '${d.name}' requires a causal flag`);
  }
  if (!d.causal) {
    throw new Error(`feature '${d.name}' is non-causal and is rejected — look-ahead bias is not allowed in features, labels, regime detection, or execution`);
  }
  return d;
}
