// Relative-value report builder.
// Pure, deterministic — composes Phase 4 return metrics and attribution.

import type { PairSimResult } from '@/tree/alpha/relative-value';
import {
  annualizedSharpe,
  annualizedSortino,
  maxDrawdownPct,
  compoundReturn,
} from '@/forest/alpha/cross-sectional-eval/return-metrics';
import { attributeCosts } from '@/forest/alpha/cross-sectional-eval/attribution';
import type {
  RelativeValueEvalConfig,
  RelativeValueReport,
  RelativeValueValidationSummary,
} from './types';

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

export function buildRelativeValueReport(
  sim: PairSimResult,
  config: RelativeValueEvalConfig,
): RelativeValueReport {
  if (!Number.isFinite(config.periodsPerYear) || config.periodsPerYear <= 0) {
    throw new Error('buildRelativeValueReport: periodsPerYear must be positive finite');
  }
  const netReturns = sim.periods.map((p) => p.netReturn);
  const grossReturns = sim.periods.map((p) => p.grossReturn);
  const totalReturn = compoundReturn(netReturns);
  const costAttribution = attributeCosts(sim.periods, config.stressMode ?? 'conservative');

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
  };
  assertCostAttribution(sim, report);
  return report;
}
