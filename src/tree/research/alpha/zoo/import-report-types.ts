// Type definitions + constants for AlphaImportReport — zoo adapter classification.

import type { Universe } from '@/tree/alpha/universe/types';
import type { StressMode } from '@/tree/alpha/cost-stress';
import type { DataWindow } from '../experiment-spec';
import type { ResearchHypothesis } from '../../hypothesis/types';
import type { AlphaProvenance } from '../provenance';

/** Importer identity stamped on hypotheses + provenance records. */
export const ZOO_IMPORTER_VERSION = 'alphazoo-adapter@1' as const;
export type ZooImporterVersion = typeof ZOO_IMPORTER_VERSION;

/**
 * Exactly one primary outcome per entry, in D3 precedence order:
 * validation-error → unsupported → non-causal → duplicate → rejected →
 * adapted → imported.
 */
export const ALPHA_IMPORT_OUTCOMES = [
  'validation-error',
  'unsupported',
  'non-causal',
  'duplicate',
  'rejected',
  'adapted',
  'imported',
] as const;
export type AlphaImportOutcome = (typeof ALPHA_IMPORT_OUTCOMES)[number];

/**
 * Adapter configuration. Pure by construction: the caller supplies the
 * universe map and data window — the adapter NEVER fetches data or I/O.
 */
export interface ZooAdapterConfig {
  /** Zoo market tag → caller-supplied Universe. Unconfigured tag ⇒ OUT_OF_UNIVERSE. */
  readonly marketUniverses: Readonly<Record<string, Universe>>;
  /** Available data window handed to the AlphaCompiler (required — escrow E2-1). */
  readonly dataWindow: DataWindow;
  /** Stress mode stamped as costAssumption on synthesized hypotheses. */
  readonly defaultCostMode: StressMode;
  /** Injected clock for deterministic createdAt (defaults to current time). */
  readonly nowIso?: string;
  readonly importerVersion: ZooImporterVersion;
}

/** Classification of one zoo entry. */
export interface PerAlphaResult {
  readonly sourceAlphaId: string;
  readonly outcome: AlphaImportOutcome;
  /** Non-empty reason list for every non-imported outcome. */
  readonly reasons: readonly string[];
  /** Present iff the entry was registered (adapted or imported). */
  readonly hypothesisId?: string;
}

/** Bucket counters — one per outcome plus the entry total. */
export interface AlphaImportTotals {
  readonly validationError: number;
  readonly unsupported: number;
  readonly nonCausal: number;
  readonly duplicate: number;
  readonly rejected: number;
  readonly adapted: number;
  readonly imported: number;
  readonly total: number;
}

/** Fail-closed import report: counters + per-entry results. */
export interface AlphaImportReport {
  readonly totals: AlphaImportTotals;
  readonly results: readonly PerAlphaResult[];
}

/** One registered candidate: hypothesis + provenance for later persistence. */
export interface RegisteredAlpha {
  readonly hypothesis: ResearchHypothesis;
  readonly provenance: AlphaProvenance;
}
