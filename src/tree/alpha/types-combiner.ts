// Alpha Lab — Combiner and Result Types
// Foundation types for alpha evaluation results and combiner configurations.

import type { AlphaDirection, AlphaSignal } from './types-signal';

// ── Alpha Result ─────────────────────────────────────────────────────────────

/** Per-alpha backtest result summary. */
export interface AlphaResult {
  /** Alpha name. */
  name: string;
  /** Source type. */
  source: import('./types-signal').AlphaSource;
  /** Total number of signals generated. */
  signalCount: number;
  /** Number of signals that resulted in a trade. */
  tradeCount: number;
  /** Win rate across all signals (0–1). */
  winRate: number;
  /** Average confidence of winning signals. */
  avgConfidence: number;
  /** Profit factor (gross profit / gross loss). */
  profitFactor: number | null;
  /** Sharpe ratio from alpha-specific trades. */
  sharpeRatio: number | null;
  /** Maximum drawdown percentage. */
  maxDrawdownPct: number;
  /** Per-symbol breakdown if multi-symbol. */
  bySymbol: Record<string, AlphaSymbolResult>;
}

/** Alpha result broken down by symbol. */
export interface AlphaSymbolResult {
  symbol: string;
  signalCount: number;
  tradeCount: number;
  winRate: number;
  profitFactor: number | null;
}

// ── Alpha Combiner ───────────────────────────────────────────────────────────

/** Combination method for merging multiple alpha signals. */
export type CombinerMethod = 'weighted_sum' | 'mlp' | 'voting' | 'max_confidence';

/** Configuration for combining multiple alpha signals into a composite signal. */
export interface AlphaCombinerConfig {
  /** How to combine signals: weighted_sum (linear), mlp (neural net), or voting (majority). */
  method: CombinerMethod;
  /** Per-alpha weights (used by weighted_sum). Key is alpha name. */
  weights: Record<string, number>;
  /** Minimum number of alphas that must agree for a composite signal (used by voting). */
  minAgreement?: number;
  /** Confidence threshold for the combined signal. */
  minConfidence: number;
  /** Symbols to combine across. */
  symbols: string[];
}

/** Result of combining multiple alpha signals. */
export interface AlphaCompositeResult {
  /** Combined direction. */
  direction: AlphaDirection;
  /** Combined confidence score. */
  confidence: number;
  /** Individual signals that contributed to this composite result. */
  contributingSignals: AlphaSignal[];
  /** The combiner configuration used. */
  config: AlphaCombinerConfig;
  /** Unix timestamp of combination. */
  timestamp: number;
}
