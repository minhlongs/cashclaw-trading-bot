// Wire-in seam config and result types (plan §3 Step D). Pure types only.

import type {
  AssetReturnSeries,
  CrossSectionalSimConfig,
  CrossSectionalSimResult,
} from '@/tree/alpha/cross-sectional/types';
import type { RegimeLabel } from '@/tree/regime/types';
import type { CrossSectionalReport } from './types';

/**
 * Evaluation config: the sim config extended with report metadata and
 * beta-targeting controls. The report `symbol` is taken from the universe id.
 */
export interface CrossSectionalEvalConfig extends CrossSectionalSimConfig {
  readonly experimentId: string;
  /** Bar timeframe of the rebalance cadence (e.g. '1h'). */
  readonly timeframe: string;
  /** Overall regime label for the experiment window. */
  readonly regime: RegimeLabel;
  /** Periods per year for annualized metrics (required). */
  readonly periodsPerYear: number;
  /** Portfolio beta target. Default 0 = no beta sizing (plain long/short). */
  readonly targetBeta?: number;
  /**
   * Benchmark return series for OLS beta estimation. REQUIRED when
   * targetBeta ≠ 0 — the engine never picks a benchmark silently.
   */
  readonly benchmarkReturns?: AssetReturnSeries;
  /** Rolling estimation window in aligned observations (default 20). */
  readonly betaWindow?: number;
  /** Minimum aligned observations to trust a beta estimate (default 10). */
  readonly betaMinObs?: number;
  /** Precomputed labels, one per rebalance period (length = periods). */
  readonly regimeLabels?: readonly RegimeLabel[];
}

/** Sizing outcome summary surfaced next to the sim and report. */
export interface CrossSectionalSizingOutcome {
  /**
   * true only when targetBeta ≠ 0 AND every rebalance was beta-scaled.
   * false when beta sizing was disabled (targetBeta = 0) or any rebalance
   * fell back fail-closed to the snapshot's own weights.
   */
  readonly betaApplied: boolean;
  /** First fail-closed fallback reason encountered (absent when none). */
  readonly fallbackReason?: string;
}

/** Full wire-in result: raw simulation, derived report, sizing summary. */
export interface CrossSectionalResult {
  readonly sim: CrossSectionalSimResult;
  readonly report: CrossSectionalReport;
  readonly sizing: CrossSectionalSizingOutcome;
}
