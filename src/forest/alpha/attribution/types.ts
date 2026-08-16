// Alpha Attribution Engine — core types
// Per-alpha performance attribution with regime breakdown and feature importance.

import type { RegimeLabel } from '@/tree/regime/types';

// ── Regime history entry ──────────────────────────────────────────────────────

/** A single regime observation: timestamp + classified label. */
export interface RegimeObservation {
  timestamp: number;
  label: RegimeLabel;
}

// ── Per-regime breakdown ──────────────────────────────────────────────────────

/** Attribution stats scoped to one regime. */
export interface RegimeAttribution {
  trades: number;
  pnl: number;
  winRate: number;
}

// ── Per-alpha attribution result ──────────────────────────────────────────────

/** Full attribution breakdown for a single alpha signal. */
export interface AttributionResult {
  /** Signal name this result belongs to. */
  alphaId: string;
  /** Total PnL contributed by trades using this alpha. */
  totalContribution: number;
  /** Sum of winning-trade PnL for this alpha. */
  winsContribution: number;
  /** Sum of losing-trade PnL for this alpha. */
  lossesContribution: number;
  /** PnL decomposed by market regime. */
  RegimeBreakdown: Record<RegimeLabel, RegimeAttribution>;
  /** Pearson correlation per feature name against trade PnL. */
  FeatureImportance: Record<string, number>;
  /** Average confidence score across the alpha's trades. */
  AvgConfidence: number;
  /** Average trade duration in minutes for this alpha. */
  avgDuration: number;
}

// ── Experiment-level attribution report ──────────────────────────────────────

/** Aggregated report spanning all alphas in an experiment run. */
export interface AttributionReport {
  /** Experiment identifier the report covers. */
  ExperimentId: string;
  /** Per-alpha results, ordered by totalContribution descending. */
  attributions: AttributionResult[];
  /** Alpha with the highest totalContribution. */
  TopContributor: string;
  /** Alpha with the lowest totalContribution (most negative). */
  WorstContributor: string;
  /** Rough diversification score: entropy of contribution weights (0..1). */
  diversificationScore: number;
}