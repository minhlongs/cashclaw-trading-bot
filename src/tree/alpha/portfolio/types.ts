// Portfolio Optimizer — Types
// Signal allocation and risk parity for multi-asset portfolio construction.

import type { RegimeLabel } from '../../regime/types';

// ── Allocation ───────────────────────────────────────────────────────────────

/** Single position allocation produced by the optimizer. */
export interface Allocation {
  /** Trading symbol (e.g. 'BTC/USDT'). */
  symbol: string;
  /** Portfolio weight assigned to this position (0–1). */
  weight: number;
  /** Notional size in quote currency. */
  size: number;
  /** Signal confidence that drove this allocation. */
  confidence: number;
  /** Regime label active at allocation time. */
  regime: RegimeLabel;
}

// ── Portfolio Target ──────────────────────────────────────────────────────────

/** Complete portfolio target output from the optimizer. */
export interface PortfolioTarget {
  /** Ordered list of allocations (one per qualified signal). */
  allocations: Allocation[];
  /** Sum of allocation weights. */
  totalExposure: number;
  /** Fraction of capital held in reserve (not allocated). */
  cashReserve: number;
  /** Gross exposure / equity ratio (>1 means leveraged). */
  leverageRatio: number;
}

// ── Optimizer Config ─────────────────────────────────────────────────────────

/** Available optimization methods. */
export type OptimizerMethod =
  | 'equal_weight'
  | 'risk_parity'
  | 'confidence_weighted'
  | 'regime_sized';

/** Configuration for the portfolio optimizer. */
export interface OptimizerConfig {
  /** Allocation method to use. */
  method: OptimizerMethod;
  /** Maximum total exposure as fraction of equity (0–1). */
  maxExposurePct: number;
  /** Minimum signal confidence to include in the portfolio. */
  minConfidence: number;
  /** Fraction of capital to hold as cash reserve (0–1). */
  cashReservePct: number;
  /** Maximum number of simultaneous positions. */
  maxPositions: number;
}
