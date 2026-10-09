import type { PairSimResult } from '@/tree/alpha/relative-value';
import { annualizedSharpe, annualizedSortino, maxDrawdownPct, compoundReturn } from '@/forest/alpha/cross-sectional-eval/return-metrics';
import { attributeCosts } from '@/forest/alpha/cross-sectional-eval/attribution';
import { breakdownByRegime } from '@/forest/alpha/cross-sectional-eval/regime-breakdown';
import { summarizeValidation, assertCostAttribution } from './report-validation';
import { computeRoundTripMetrics } from './report-roundtrips';
import type { RelativeValueEvalConfig, RelativeValueReport, RelativeValueReportOptions } from './types';

export const FUNDING_NOTE = 'N/A — derivative endpoints 403; spot assumption';

export function buildRelativeValueReport(
  sim: PairSimResult, config: RelativeValueEvalConfig, options: RelativeValueReportOptions = {},
): RelativeValueReport {
  if (!Number.isFinite(config.periodsPerYear) || config.periodsPerYear <= 0) {
    throw new Error('buildRelativeValueReport: periodsPerYear must be positive finite');
  }
  const netReturns = sim.periods.map((p) => p.netReturn);
  const totalReturn = compoundReturn(netReturns);
  const costAttribution = attributeCosts(sim.periods, config.stressMode ?? 'conservative');
  const regimeBreakdown = options.regimeLabels !== undefined
    ? breakdownByRegime(sim.periods, options.regimeLabels, config.periodsPerYear) : undefined;
  const report: RelativeValueReport = {
    experimentId: config.experimentId, pairLabel: 'PAIR', timeframe: config.timeframe,
    totalReturn, netReturn: totalReturn, grossReturn: compoundReturn(sim.periods.map((p) => p.grossReturn)),
    annualizedSharpe: annualizedSharpe(netReturns, config.periodsPerYear),
    annualizedSortino: annualizedSortino(netReturns, config.periodsPerYear),
    maxDrawdownPct: maxDrawdownPct(sim.equityCurve), turnoverTotal: sim.totalTurnover, tradeCount: sim.tradeCount,
    costAttribution, exposureSeries: { gross: sim.periods.map((p) => p.grossExposure), net: sim.periods.map((p) => p.netExposure) },
    validationSummary: summarizeValidation(sim), periodCount: sim.periods.length, periodsPerYear: config.periodsPerYear,
    roundTripMetrics: computeRoundTripMetrics(sim.periods), fundingPct: 0, fundingNote: FUNDING_NOTE,
    pairStability: options.pairStability, regimeBreakdown,
  };
  assertCostAttribution(sim, report);
  return report;
}
