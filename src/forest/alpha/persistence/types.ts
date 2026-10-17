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
  id: string;
  hypothesis: string;
  dataset: string;
  symbol: string;
  timeframe: string;
  featureSetJson: string;
  regimeFilterJson: string;
  entryRuleJson: string;
  exitRuleJson: string;
  positionSizingJson: string;
  feeModelJson: string;
  slippageModelJson: string;
  trainPeriodJson: string;
  validationPeriodJson: string;
  testPeriodJson: string;
  randomSeed: number | null;
  gitCommit: string | null;
  configSnapshotJson: string;
  createdAt: number;
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