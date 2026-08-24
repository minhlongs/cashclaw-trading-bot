// Cross-sectional evaluation report types (plan §3 Step C).
// Pure types only — no I/O, no network, no Node APIs.

import type { RegimeLabel } from '@/tree/regime/types';

/** Decomposition of total transaction costs into component shares. */
export interface CostAttributionBreakdown {
  readonly fees: number;
  readonly slippage: number;
  readonly marketImpact: number;
}

/** Per-period gross (Σ|w|) and net (Σw) exposure series. */
export interface ExposureSeries {
  readonly gross: number[];
  readonly net: number[];
}

/**
 * Multi-asset evaluation report for a cross-sectional long/short portfolio.
 * Deliberately a PARALLEL contract to the single-symbol EvaluationReport,
 * not an extension of it — both shapes stay stable independently.
 */
export interface CrossSectionalReport {
  /** Experiment identifier supplied by the caller. */
  readonly experimentId: string;
  /** Universe id the portfolio was simulated on. */
  readonly symbol: string;
  /** Bar timeframe of the rebalance cadence (e.g. '1h'). */
  readonly timeframe: string;
  /** Overall regime label for the full experiment window. */
  readonly regime: RegimeLabel;
  /** Headline compounded NET return (after costs). */
  readonly totalReturn: number;
  /** Compounded gross return (before costs). */
  readonly grossReturn: number;
  /** Compounded net return (same figure as totalReturn). */
  readonly netReturn: number;
  /** Annualized Sharpe on the portfolio net return series; null when degenerate. */
  readonly annualizedSharpe: number | null;
  /** Annualized Sortino on the portfolio net return series; null when degenerate. */
  readonly annualizedSortino: number | null;
  /** Maximum peak-to-trough drawdown of the equity curve, in percent. */
  readonly maxDrawdownPct: number;
  /** Σ one-sided turnover across all rebalances. */
  readonly turnoverTotal: number;
  /** One-sided turnover per rebalance, in period order. */
  readonly turnoverPerRebalance: number[];
  /** Transaction costs decomposed into fee/slippage/impact shares. */
  readonly costAttribution: CostAttributionBreakdown;
  /** Cumulative gross PnL attributed to positive-weight (long) positions. */
  readonly longSidePnl: number;
  /** Cumulative gross PnL attributed to negative-weight (short) positions. */
  readonly shortSidePnl: number;
  /** Per-period gross (Σ|w|) and net (Σw) exposure. */
  readonly exposureSeries: ExposureSeries;
  /**
   * Realized portfolio beta per period. Empty unless the wire-in seam ran
   * beta-aware sizing and supplied the series (Step C has no beta inputs).
   */
  readonly realizedBetaSeries: number[];
  /** Per-regime sub-reports from caller-supplied labels; empty when unlabeled. */
  readonly byRegime: Record<RegimeLabel, Partial<CrossSectionalReport>>;
  /** Number of simulated rebalance periods. */
  readonly periodCount: number;
  /** Periods per year used for annualization (echoed for traceability). */
  readonly periodsPerYear: number;
}
