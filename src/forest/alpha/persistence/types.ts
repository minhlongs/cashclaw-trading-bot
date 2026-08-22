// Alpha Persistence — Types
// Serializable data models and adapter interface for alpha results & experiments.

import type { AlphaResult } from '@/tree/alpha/types';
import type { Experiment, ExperimentResult, ExperimentStatus } from '@/forest/alpha/experiments/types';

// ── Stored Models ────────────────────────────────────────────────────────────

/** Persisted alpha result — JSON-serializable subset of AlphaResult with metadata. */
export interface StoredAlphaResult {
  /** Unique identifier for this stored result. */
  id: string;
  /** Alpha name. */
  name: string;
  /** Source type. */
  source: string;
  /** The full alpha result payload (serialized). */
  resultJson: string;
  /** Unix timestamp when stored. */
  createdAt: number;
}

/** Persisted experiment — serializable snapshot of an Experiment. */
export interface StoredExperiment {
  /** Unique experiment identifier. */
  id: string;
  /** Human-readable hypothesis. */
  hypothesis: string;
  /** Dataset identifier. */
  dataset: string;
  /** Trading symbol. */
  symbol: string;
  /** Candle timeframe (e.g. '1h', '4h'). */
  timeframe: string;
  /** JSON-serialized feature set. */
  featureSetJson: string;
  /** JSON-serialized regime filter array. */
  regimeFilterJson: string;
  /** JSON-serialized entry rule. */
  entryRuleJson: string;
  /** JSON-serialized exit rule. */
  exitRuleJson: string;
  /** JSON-serialized position sizing config. */
  positionSizingJson: string;
  /** JSON-serialized fee model. */
  feeModelJson: string;
  /** JSON-serialized slippage model. */
  slippageModelJson: string;
  /** JSON-serialized train period. */
  trainPeriodJson: string;
  /** JSON-serialized validation period. */
  validationPeriodJson: string;
  /** JSON-serialized test period. */
  testPeriodJson: string;
  /** Optional random seed. */
  randomSeed: number | null;
  /** Optional git commit hash. */
  gitCommit: string | null;
  /** JSON-serialized config snapshot. */
  configSnapshotJson: string;
  /** Unix timestamp when stored. */
  createdAt: number;
  /** Unix timestamp when last updated. */
  updatedAt: number;
}

/** Persisted experiment result — JSON-serialized ExperimentResult payload. */
export interface StoredExperimentResult {
  /** Unique identifier. */
  id: string;
  /** Foreign key to experiment. */
  experimentId: string;
  /** Experiment status. */
  status: ExperimentStatus;
  /** JSON-serialized full result payload. */
  resultJson: string;
  /** JSON-serialized artifact paths. */
  artifactsJson: string;
  /** Unix timestamp when stored. */
  createdAt: number;
  /** Unix timestamp when last updated. */
  updatedAt: number;
}

// ── Adapter Interface ────────────────────────────────────────────────────────

/** Unified persistence adapter for alpha results and experiments. */
export interface PersistenceAdapter {
  /** Save an alpha result. Overwrites if the same id exists. */
  saveResult(id: string, result: AlphaResult): Promise<void>;

  /** Load an alpha result by id. Returns null if not found. */
  loadResult(id: string): Promise<AlphaResult | null>;

  /** Save an experiment definition. */
  saveExperiment(experiment: Experiment): Promise<void>;

  /** Load an experiment by id. Returns null if not found. */
  loadExperiment(id: string): Promise<Experiment | null>;

  /** List all stored experiments, newest first. */
  listExperiments(): Promise<StoredExperiment[]>;

  /** Save an experiment result. */
  saveExperimentResult(experimentId: string, result: ExperimentResult): Promise<void>;

  /** Load experiment results for a given experiment, newest first. */
  loadExperimentResults(experimentId: string): Promise<ExperimentResult[]>;
}