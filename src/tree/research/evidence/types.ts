// EvidenceObject — immutable record of one experiment's verdict for a
// hypothesis. APPEND-ONLY semantics (mirrors ResearchEntry): evidence is
// never mutated or deleted; a corrected verdict is a NEW object. All
// fields are readonly; persistence (Phase 2) must enforce append-only.

import type { StressMode } from '@/forest/backtest/cost-model';

/** What kind of experiment produced this evidence. */
export const EVIDENCE_KINDS = [
  'backtest',
  'oos',
  'robustness',
  'paper',
  'shadow',
  'cost-stress',
  'regime',
  'multiple-testing',
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Verdict of the experiment against the hypothesis. */
export const EVIDENCE_VERDICTS = ['support', 'refute', 'inconclusive'] as const;
export type EvidenceVerdict = (typeof EVIDENCE_VERDICTS)[number];

/** One append-only evidence record binding an experiment outcome to a hypothesis. */
export interface EvidenceObject {
  readonly id: string;
  readonly hypothesisId: string;
  readonly experimentId: string;
  readonly kind: EvidenceKind;
  readonly verdict: EvidenceVerdict;
  /** Canonical JSON string of the metrics payload (deterministic serialization). */
  readonly metricsJson: string;
  /** Cost stress mode the experiment ran under. */
  readonly costMode: StressMode;
  /** Git commit the experiment code ran at (reproducibility). */
  readonly gitCommit: string;
  /** Deterministic replay seed; null when the run is seedless. */
  readonly seed: number | null;
  /** ISO-8601 timestamp of evidence creation. */
  readonly createdAt: string;
}
