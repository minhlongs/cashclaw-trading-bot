// Relative-value evaluation report types.
// Parallel to cross-sectional-eval types; pure types only.

import type {
  PairPanel, PairSimConfig, PairSimResult, PairValidationEntry,
} from '@/tree/alpha/relative-value';
import type { CostAttributionBreakdown, ExposureSeries } from '@/forest/alpha/cross-sectional-eval/types';
import type { RegimeLabel } from '@/tree/regime/types';
import type { AssetReturnSeries } from '@/tree/alpha/cross-sectional/types';

/** Per-regime OOS sub-report (injected labels; cross-sectional precedent). */
export interface RVRegimeSubReport {
  readonly netReturn: number; readonly annualizedSharpe: number | null; readonly turnoverTotal: number;
}

/** Trade-level performance metrics over completed round trips. */
export interface RoundTripMetrics {
  readonly expectancyPerTrade: number;
  readonly profitFactor: number;
  readonly winRate: number;
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
  readonly rollingCorrelationSeries?: readonly number[];
  readonly validationSummary: RelativeValueValidationSummary;
  readonly periodCount: number;
  readonly periodsPerYear: number;
  readonly roundTripMetrics: RoundTripMetrics;
  readonly fundingPct: number;
  readonly fundingNote: string;
  readonly pairStability?: Readonly<Record<string, number>>;
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
  /** Optional rolling correlation window (bars) enables rolling correlation diagnostics. */
  readonly correlationWindow?: number;
}

/** Evaluation input bundle used by validator tests. */
export interface RelativeValueEvalInput {
  readonly panel: PairPanel;
  readonly config: RelativeValueEvalConfig;
}
