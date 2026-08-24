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
import type { AssetReturnSeries } from '@/tree/alpha/cross-sectional/types';

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
