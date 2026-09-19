// ExperimentSpec — deterministic, readonly specification for an alpha experiment.
// Pure types + pure derivations. Derived from AlphaResearch OS spec §9.
// Re-exports all symbols from the type and deriver modules for backward
// compatibility (single import surface for downstream consumers).

export type {
  DataWindow,
  ExperimentPeriod,
  ExperimentSpec,
  CompileFailureCode,
  CompileResult,
} from './experiment-spec-types';

export {
  BARRIER_DERIVATION,
  parseTimeframeToMs,
  deriveBarrierConfig,
  MIN_TRAIN_BARS,
  derivePeriods,
  DEFAULT_SEED,
  deriveSeedFromSpecId,
} from './experiment-spec-deriver';
