// Alpha Execution Layer — Types
// Paper-trading execution engine for alpha signals.

import type { AlphaSignal } from '@/tree/alpha/types';
import type { RegimeLabel } from '@/tree/regime/types';

// ── Configuration ──────────────────────────────────────────────────────────────

/** Controls how alpha signals are turned into paper positions. */
export interface AlphaExecutionConfig {
  /** Whether the execution layer is active. */
  enabled: boolean;
  /** Maximum number of open positions simultaneously. */
  maxPositions: number;
  /** Maximum portfolio exposure as a fraction of capital (0–1). */
  maxExposurePct: number;
  /** Only execute in these regimes; empty array means all regimes. */
  regimeFilter: RegimeLabel[];
  /** Minimum confidence required (0–1). */
  minConfidence: number;
  /** Auto-close a position after this many milliseconds if still open. */
  positionTimeoutMs: number;
}

// ── Position & Portfolio ───────────────────────────────────────────────────────

/** Unique direction for an alpha position. */
export type AlphaPositionDirection = 'long' | 'short';

/** A single paper-trading position opened from an alpha signal. */
export interface AlphaPosition {
  /** Unique position identifier. */
  id: string;
  /** Trading symbol. */
  symbol: string;
  /** Position direction. */
  direction: AlphaPositionDirection;
  /** Price at entry. */
  entryPrice: number;
  /** Quantity opened. */
  quantity: number;
  /** Source alpha signal name. */
  alphaName: string;
  /** Confidence of the signal that opened this position (0–1). */
  confidence: number;
  /** Realised P&L; negative if closed at a loss. */
  pnl: number;
  /** ISO timestamp when the position was opened. */
  openedAt: string;
  /** ISO timestamp when the position was closed (undefined while open). */
  closedAt?: string;
  /** Reason for closing. */
  closeReason?: 'exit_signal' | 'timeout' | 'regime_shift' | 'manual';
}

/** Snapshot of the alpha paper portfolio at a point in time. */
export interface AlphaPortfolio {
  /** Currently open positions. */
  positions: AlphaPosition[];
  /** Total notional exposure (sum of |quantity × entryPrice| for open positions). */
  totalExposure: number;
  /** Current market regime. */
  regime: RegimeLabel;
  /** Number of positions currently open. */
  openCount: number;
  /** Aggregated realised P&L across closed positions. */
  totalRealisedPnl: number;
}

// ── Execution Events ───────────────────────────────────────────────────────────

/** Reason an alpha signal was rejected. */
export type AlphaRejectionReason =
  | 'disabled'
  | 'confidence_below_threshold'
  | 'regime_filtered'
  | 'max_positions_reached'
  | 'max_exposure_reached'
  | 'duplicate_signal';

/** Telemetry payload published by the execution engine. */
export interface AlphaExecutionTelemetry {
  event: 'position_opened' | 'position_closed' | 'signal_rejected' | 'portfolio_snapshot';
  timestamp: number;
  payload: Record<string, unknown>;
}