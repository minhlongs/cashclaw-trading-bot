// Relative-value evaluation report types.
// Parallel to cross-sectional-eval types; pure types only.

import type {
  PairPanel,
  PairSimConfig,
  PairSimResult,
  PairValidationEntry,
} from '@/tree/alpha/relative-value';
import type {
  CostAttributionBreakdown,
  ExposureSeries,
} from '@/forest/alpha/cross-sectional-eval/types';
import type { RegimeLabel } from '@/tree/regime/types';
import type { AssetReturnSeries } from '@/tree/alpha/cross-sectional/types';

/** Per-regime OOS sub-report (injected labels; cross-sectional precedent). */
export interface RVRegimeSubReport {
  readonly netReturn: number;
  readonly annualizedSharpe: number | null;
  readonly turnoverTotal: number;
}

/** Trade-level performance metrics over completed round trips. */
export interface RoundTripMetrics {
  /** Mean net return per completed trade (0 when no completed trades). */
  readonly expectancyPerTrade: number;
  /** Gross profit / gross loss over completed trades (0 when undefined). */
  readonly profitFactor: number;
  /** Winning trades / completed trades (0 when no completed trades). */
  readonly winRate: number;
  /** Completed round-trip count backing the metrics above. */
  readonly completedTrades: number;
}

/** Flat, JSON-safe summary of simulator validation gate outcomes. */
export interface RelativeValueValidationSummary {
  readonly gateRunCount: number;
  readonly tradableCount: number;
  readonly notTradableCount: number;
  readonly lastTradable: boolean | null;
  readonly reasons: readonly string[];
}

/** Report for one pair-spread relative-value experiment. */
export interface RelativeValueReport {
  readonly experimentId: string;
  readonly pairLabel: string;
  readonly timeframe: string;
  readonly totalReturn: number;
  readonly netReturn: number;
  readonly grossReturn: number;
  readonly annualizedSharpe: number | null;
  readonly annualizedSortino: number | null;
  readonly maxDrawdownPct: number;
  readonly turnoverTotal: number;
  readonly tradeCount: number;
  readonly costAttribution: CostAttributionBreakdown;
  readonly exposureSeries: ExposureSeries;
  readonly realizedPairBetaSeries?: readonly number[];
  readonly validationSummary: RelativeValueValidationSummary;
  readonly periodCount: number;
  readonly periodsPerYear: number;
  /** Trade-level metrics over completed round trips (additive, Step 6+). */
  readonly roundTripMetrics: RoundTripMetrics;
  /**
   * Funding carry share of returns. Constantly 0 — Binance derivative
   * endpoints return HTTP 403 from this environment (roadmap Known Backlog);
   * spot assumption documented in docs/PAIRS_RESEARCH_INTEGRATION.md §3.
   */
  readonly fundingPct: number;
  /** Why fundingPct carries no data. */
  readonly fundingNote: string;
  /** Stability scores per pair label, when supplied by the caller. */
  readonly pairStability?: Readonly<Record<string, number>>;
  /** Per-regime breakdown via injected causal labels (optional, additive). */
  readonly regimeBreakdown?: Readonly<Record<RegimeLabel, RVRegimeSubReport>>;
}

/** Extended report input beyond the sim + base config. */
export interface RelativeValueReportOptions {
  /** Stability scores keyed by pair label (e.g. 'AAA/BBB'). */
  readonly pairStability?: Readonly<Record<string, number>>;
  /** Timestamp-aligned causal regime labels, one per sim period. */
  readonly regimeLabels?: readonly RegimeLabel[];
}

/** Full evaluation artifact: raw sim, report, and raw validation trail. */
export interface RelativeValueResult {
  readonly sim: PairSimResult;
  readonly report: RelativeValueReport;
  readonly validation: readonly PairValidationEntry[];
}

/** Config for evaluateRelativeValue. */
export interface RelativeValueEvalConfig extends PairSimConfig {
  readonly experimentId: string;
  readonly timeframe: string;
  readonly periodsPerYear: number;
  /** Optional benchmark returns enable realized-beta diagnostics only. */
  readonly benchmarkReturns?: AssetReturnSeries;
  readonly betaWindow?: number;
  readonly betaMinObs?: number;
}

/** Evaluation input bundle used by validator tests. */
export interface RelativeValueEvalInput {
  readonly panel: PairPanel;
  readonly config: RelativeValueEvalConfig;
}
