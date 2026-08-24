// Microstructure module barrel.
export type {
  MicrostructureSnapshot,
  FeatureVector,
} from './types';

export {
  MICROSTRUCTURE_FEATURES,
  MICROSTRUCTURE_FEATURE_NAMES,
  getMicrostructureFeature,
} from './contracts';

export type {
  DepthLevel,
  DepthPayload,
  TradePrint,
  RawPollPayload,
  PollResult,
  PollSuccess,
  PollFailure,
  IngestStatus,
} from './snapshot-types';

export { parseDepthPayload, parseAggTradesPayload } from './parse';

export type { QualityReport } from './quality';
export { validateDepth, validateTradeBatch, MAX_STALE_DRIFT_MS } from './quality';

export type { AggregatedTrades, ValidatedSnapshot } from './types';
export { computeFeatureVectors } from './feature-computer';
