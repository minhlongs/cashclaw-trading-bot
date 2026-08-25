// Relative-value report builder.
// Pure, deterministic — composes Phase 4 return metrics and attribution.
// Additive extension: trade-level round-trip metrics, explicit funding N/A,
// optional injected stability map and regime breakdown.

import type { PairPeriodRecord, PairSimResult } from '@/tree/alpha/relative-value';
import {
  annualizedSharpe,
  annualizedSortino,
  maxDrawdownPct,
  compoundReturn,
} from '@/forest/alpha/cross-sectional-eval/return-metrics';
import { attributeCosts } from '@/forest/alpha/cross-sectional-eval/attribution';
import { breakdownByRegime } from '@/forest/alpha/cross-sectional-eval/regime-breakdown';
import { extractRoundTrips } from './round-trips';
import type {
  RelativeValueEvalConfig,
  RelativeValueReport,
  RelativeValueReportOptions,
  RelativeValueValidationSummary,
  RoundTripMetrics,
} from './types';

/** Funding is documented N/A: derivative endpoints 403; spot assumption. */
export const FUNDING_NOTE = 'N/A — derivative endpoints 403; spot assumption';

function uniqueReasons(sim: PairSimResult): string[] {
  const reasons = new Set<string>();
  for (const entry of sim.validationTrail) {
    for (const reason of entry.reasons) reasons.add(reason);
  }
  for (const warning of sim.warnings) reasons.add(warning);
  return [...reasons].sort();
}

function summarizeValidation(sim: PairSimResult): RelativeValueValidationSummary {
  const gateRunCount = sim.validationTrail.length;
  const tradableCount = sim.validationTrail.filter((v) => v.tradable).length;
  const notTradableCount = gateRunCount - tradableCount;
  const last = sim.validationTrail.at(-1);
  return {
    gateRunCount,
    tradableCount,
    notTradableCount,
    lastTradable: last?.tradable ?? null,
    reasons: uniqueReasons(sim),
  };
}

function assertCostAttribution(sim: PairSimResult, report: RelativeValueReport): void {
  const sumCosts = sim.periods.reduce((sum, p) => sum + p.costPct, 0);
  const attributed =
    report.costAttribution.fees +
    report.costAttribution.slippage +
    report.costAttribution.marketImpact;
  if (Math.abs(attributed - sumCosts) > 1e-12) {
    throw new Error('buildRelativeValueReport: cost attribution total mismatch');
  }
}

/**
 * Trade-level metrics over completed round trips. Conventions inherited from
 * evaluation/report-helpers.ts: profit factor serializes to 0 when undefined
 * (no losses or no trades), win rate and expectancy use completed trades only.
 */
function computeRoundTripMetrics(periods: readonly PairPeriodRecord[]): RoundTripMetrics {
  const { roundTrips } = extractRoundTrips(periods);
  if (roundTrips.length === 0) {
    return { expectancyPerTrade: 0, profitFactor: 0, winRate: 0, completedTrades: 0 };
  }
  const nets = roundTrips.map((t) => t.netReturn);
  const grossProfit = nets.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(nets.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  const wins = nets.filter((r) => r > 0).length;
  const rawProfitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  return {
    expectancyPerTrade: nets.reduce((a, b) => a + b, 0) / nets.length,
    profitFactor: Number.isFinite(rawProfitFactor) ? rawProfitFactor : 0,
    winRate: wins / nets.length,
    completedTrades: roundTrips.length,
  };
}

export function buildRelativeValueReport(
  sim: PairSimResult,
  config: RelativeValueEvalConfig,
  options: RelativeValueReportOptions = {},
): RelativeValueReport {
  if (!Number.isFinite(config.periodsPerYear) || config.periodsPerYear <= 0) {
    throw new Error('buildRelativeValueReport: periodsPerYear must be positive finite');
  }
  const netReturns = sim.periods.map((p) => p.netReturn);
  const grossReturns = sim.periods.map((p) => p.grossReturn);
  const totalReturn = compoundReturn(netReturns);
  const costAttribution = attributeCosts(sim.periods, config.stressMode ?? 'conservative');

  let regimeBreakdown: RelativeValueReport['regimeBreakdown'];
  if (options.regimeLabels !== undefined) {
    // Fail-closed inside breakdownByRegime on length mismatch.
    regimeBreakdown = breakdownByRegime(sim.periods, options.regimeLabels, config.periodsPerYear);
  }

  const report: RelativeValueReport = {
    experimentId: config.experimentId,
    // Placeholder only: the evaluate seam overwrites with LEG_A/LEG_B.
    pairLabel: 'PAIR',
    timeframe: config.timeframe,
    totalReturn,
    netReturn: totalReturn,
    grossReturn: compoundReturn(grossReturns),
    annualizedSharpe: annualizedSharpe(netReturns, config.periodsPerYear),
    annualizedSortino: annualizedSortino(netReturns, config.periodsPerYear),
    maxDrawdownPct: maxDrawdownPct(sim.equityCurve),
    turnoverTotal: sim.totalTurnover,
    tradeCount: sim.tradeCount,
    costAttribution,
    exposureSeries: {
      gross: sim.periods.map((p) => p.grossExposure),
      net: sim.periods.map((p) => p.netExposure),
    },
    validationSummary: summarizeValidation(sim),
    periodCount: sim.periods.length,
    periodsPerYear: config.periodsPerYear,
    roundTripMetrics: computeRoundTripMetrics(sim.periods),
    fundingPct: 0,
    fundingNote: FUNDING_NOTE,
    pairStability: options.pairStability,
    regimeBreakdown,
  };
  assertCostAttribution(sim, report);
  return report;
}
