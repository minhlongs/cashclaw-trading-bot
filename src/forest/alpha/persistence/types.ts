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

// ── Research Registry Models ─────────────────────────────────────────────────

/** Lifecycle status of a research registry entry. */
export type RegistryEntryStatus = 'PROPOSED' | 'RUNNING' | 'SURVIVED' | 'FALSIFIED' | 'ARCHIVED';

/** Lifecycle status of a hypothesis lineage node. */
export type HypothesisNodeStatus = 'proposed' | 'testing' | 'survived' | 'falsified' | 'archived';

/**
 * Persisted research registry entry — JSON-serializable snapshot of a
 * ResearchEntry (tree/alpha/registry). Append-only: rows are never updated
 * after insert; status changes are recorded as new evidence.
 */
export interface StoredRegistryEntry {
  /** Unique entry identifier. */
  entryId: string;
  /** Human-readable hypothesis statement. */
  hypothesis: string;
  /** JSON-serialized data source identifiers. */
  dataSourcesJson: string;
  /** JSON-serialized feature set. */
  featureSetJson: string;
  /** Regime label the entry targets, if any. */
  regime: string | null;
  /** JSON-serialized train/validation/OOS periods. */
  periodsJson: string;
  /** JSON-serialized cost model. */
  costsJson: string;
  /** JSON-serialized slippage model. */
  slippageJson: string;
  /** Random seed used for reproducibility, if any. */
  seed: string | null;
  /** Git commit hash the entry was produced at, if any. */
  gitCommit: string | null;
  /** JSON-serialized result payload, if any. */
  resultJson: string | null;
  /** Why the entry was falsified, if applicable. */
  falsificationReason: string | null;
  /** Entry lifecycle status. */
  status: RegistryEntryStatus;
  /** SHA-256 hash over canonical config+seed+gitCommit for reproducibility. */
  experimentHash: string | null;
  /** Reproducibility verdict, if any. */
  reproducibility: string | null;
  /** Unix timestamp when stored. */
  createdAt: number;
}

/**
 * Persisted hypothesis lineage node — one row per hypothesis in the research
 * graph. Append-only: historical nodes are never mutated.
 */
export interface StoredHypothesisNode {
  /** Node identifier (e.g. 'H001', 'H001-A'). */
  id: string;
  /** Parent node id, or null for root hypotheses. */
  parentId: string | null;
  /** Mutation description relative to the parent, if any. */
  mutation: string | null;
  /** Node lifecycle status. */
  status: HypothesisNodeStatus;
  /** JSON-serialized evidence strings. */
  evidenceJson: string;
  /** Unix timestamp when stored. */
  createdAt: number;
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

  // ── Research registry (optional — append-only) ────────────────────────────

  /**
   * Save a research registry entry. Append-only: an existing entry with the
   * same id is never overwritten or mutated.
   */
  saveRegistryEntry?(entry: StoredRegistryEntry): Promise<void>;

  /** List all research registry entries, newest first. */
  listRegistry?(): Promise<StoredRegistryEntry[]>;

  /**
   * Save a hypothesis lineage node. Append-only: an existing node with the
   * same id is never overwritten or mutated.
   */
  saveHypothesisNode?(node: StoredHypothesisNode): Promise<void>;

  /** Load all hypothesis lineage nodes, oldest first. */
  loadLineage?(): Promise<StoredHypothesisNode[]>;
}