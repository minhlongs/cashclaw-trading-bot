// Cross-sectional report builder (plan §3 Step C).
// Pure, deterministic — no I/O, no network, no Math.random/Date.now.
// Composes return metrics, attribution, and regime breakdown into the
// final CrossSectionalReport.

import type { CrossSectionalSimResult } from '@/tree/alpha/cross-sectional/types';
import type { RegimeLabel } from '@/tree/regime/types';
import type {
  CrossSectionalReport,
  ExposureSeries,
} from './types';
import {
  annualizedSharpe,
  annualizedSortino,
  maxDrawdownPct,
  compoundReturn,
} from './return-metrics';
import {
  attributeLongShortProportional,
  attributeLongShortPrecise,
  attributeCosts,
  type PreciseAttributionInput,
} from './attribution';
import { breakdownByRegime } from './regime-breakdown';

export interface BuildReportConfig {
  /** Experiment identifier. */
  readonly experimentId: string;
  /** Universe id (symbol). */
  readonly symbol: string;
  /** Bar timeframe (e.g. '1h'). */
  readonly timeframe: string;
  /** Overall regime label for the experiment window. */
  readonly regime: RegimeLabel;
  /** Periods per year for annualization (e.g. 365*24 for hourly). */
  readonly periodsPerYear: number;
  /** Cost stress mode for cost attribution decomposition. */
  readonly stressMode?: 'normal' | 'conservative' | 'adverse' | 'extreme';
  /** Optional per-asset returns for precise long/short attribution. */
  readonly assetPeriodReturns?: readonly PreciseAttributionInput[];
  /** Optional precomputed regime labels (aligned to periods). */
  readonly regimeLabels?: readonly RegimeLabel[];
}

/**
 * Build the full cross-sectional evaluation report from a simulation result.
 * All metrics are computed on the portfolio *net return series* (not trade PnL).
 * Max drawdown is on the equity curve. Cost attribution uses stressMode proportions.
 * Regime breakdown is only produced when regimeLabels is provided and aligned.
 */
export function buildCrossSectionalReport(
  simResult: CrossSectionalSimResult,
  config: BuildReportConfig,
): CrossSectionalReport {
  const { periods, equityCurve } = simResult;

  // Validate config
  if (!Number.isFinite(config.periodsPerYear) || config.periodsPerYear <= 0) {
    throw new Error('buildCrossSectionalReport: periodsPerYear must be positive finite');
  }
  if (config.assetPeriodReturns !== undefined && config.assetPeriodReturns.length !== periods.length) {
    throw new Error(
      `buildCrossSectionalReport: assetPeriodReturns length (${config.assetPeriodReturns.length}) !== periods.length (${periods.length})`,
    );
  }
  if (config.regimeLabels !== undefined && config.regimeLabels.length !== periods.length) {
    throw new Error(
      `buildCrossSectionalReport: regimeLabels length (${config.regimeLabels.length}) !== periods.length (${periods.length})`,
    );
  }

  // Net return series from periods
  const netReturns = periods.map((p) => p.netReturn);
  const grossReturns = periods.map((p) => p.grossReturn);

  // Headline metrics
  const totalReturn = compoundReturn(netReturns); // same as netReturn
  const grossReturn = compoundReturn(grossReturns);
  const annualizedSharpeVal = annualizedSharpe(netReturns, config.periodsPerYear);
  const annualizedSortinoVal = annualizedSortino(netReturns, config.periodsPerYear);
  const maxDrawdownPctVal = maxDrawdownPct(equityCurve);

  // Turnover
  const turnoverTotal = periods.reduce((s, p) => s + p.turnover, 0);
  const turnoverPerRebalance = periods.map((p) => p.turnover);

  // Cost attribution
  const costAttribution = attributeCosts(periods, config.stressMode ?? 'conservative');

  // Long/short attribution
  let longSidePnl = 0;
  let shortSidePnl = 0;
  if (config.assetPeriodReturns !== undefined && config.assetPeriodReturns.length > 0) {
    const precise = attributeLongShortPrecise(config.assetPeriodReturns);
    longSidePnl = precise.longSidePnl;
    shortSidePnl = precise.shortSidePnl;
  } else {
    const prop = attributeLongShortProportional(periods);
    longSidePnl = prop.longSidePnl;
    shortSidePnl = prop.shortSidePnl;
  }

  // Exposure series
  const exposureSeries: ExposureSeries = {
    gross: periods.map((p) => p.grossExposure),
    net: periods.map((p) => p.netExposure),
  };

  // Realized beta series (empty — Step D wire-in will populate if beta sizing ran)
  const realizedBetaSeries: number[] = [];

  // Regime breakdown
  let byRegime: Record<RegimeLabel, Partial<CrossSectionalReport>> = {
    TREND_UP: {},
    TREND_DOWN: {},
    RANGE: {},
    HIGH_VOLATILITY: {},
    LOW_VOLATILITY: {},
    SHOCK: {},
    UNKNOWN: {},
  };
  if (config.regimeLabels !== undefined && config.regimeLabels.length > 0) {
    const regimeBreakdown = breakdownByRegime(
      periods,
      config.regimeLabels,
      config.periodsPerYear,
    );
    byRegime = {
      TREND_UP: regimeBreakdown.TREND_UP,
      TREND_DOWN: regimeBreakdown.TREND_DOWN,
      RANGE: regimeBreakdown.RANGE,
      HIGH_VOLATILITY: regimeBreakdown.HIGH_VOLATILITY,
      LOW_VOLATILITY: regimeBreakdown.LOW_VOLATILITY,
      SHOCK: regimeBreakdown.SHOCK,
      UNKNOWN: regimeBreakdown.UNKNOWN,
    };
  }

  return {
    experimentId: config.experimentId,
    symbol: config.symbol,
    timeframe: config.timeframe,
    regime: config.regime,
    totalReturn,
    grossReturn,
    netReturn: totalReturn,
    annualizedSharpe: annualizedSharpeVal,
    annualizedSortino: annualizedSortinoVal,
    maxDrawdownPct: maxDrawdownPctVal,
    turnoverTotal,
    turnoverPerRebalance,
    costAttribution,
    longSidePnl,
    shortSidePnl,
    exposureSeries,
    realizedBetaSeries,
    byRegime,
    periodCount: periods.length,
    periodsPerYear: config.periodsPerYear,
  };
}