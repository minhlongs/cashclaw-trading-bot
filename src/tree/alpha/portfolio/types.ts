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

// ── Portfolio Engine ─────────────────────────────────────────────────────────
// Deterministic risk overlays for composed-alpha scoring pipeline (Mission §7).

/** Risk overlay configuration for portfolio construction. */
export interface PortfolioConfig {
  readonly targetVolatility: number;
  readonly maxPositionWeight: number;
  readonly maxGrossExposure: number;
  readonly maxNetExposure: number;
  readonly maxCorrelatedExposure: number;
  readonly correlationBucketThreshold: number;
  readonly maxBetaExposure: number;
  readonly maxTurnover: number;
  readonly drawdownThreshold: number;
  readonly deRiskFactor: number;
}

/** Causally-bounded risk inputs computed from historical data (t < now). */
export interface RiskInputs {
  readonly realizedVolatility: number;
  readonly correlationMatrix: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly betas: ReadonlyMap<string, number | null>;
  readonly currentDrawdown: number;
}

/** Single position in the target portfolio. */
export interface PortfolioPosition {
  readonly alphaId: string;
  readonly targetWeight: number;
  readonly turnover: number;
}

/** Deterministic portfolio construction result. */
export interface PortfolioResult {
  readonly positions: readonly PortfolioPosition[];
  readonly grossExposure: number;
  readonly netExposure: number;
  readonly totalTurnover: number;
  readonly riskAdjustments: readonly string[];
  readonly drawdownDeRisked: boolean;
}
