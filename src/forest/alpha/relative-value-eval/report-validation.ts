import type { PairSimResult } from '@/tree/alpha/relative-value';
import type { RelativeValueReport, RelativeValueValidationSummary } from './types';

export function uniqueReasons(sim: PairSimResult): string[] {
  const reasons = new Set<string>();
  for (const entry of sim.validationTrail) {
    for (const reason of entry.reasons) reasons.add(reason);
  }
  for (const warning of sim.warnings) reasons.add(warning);
  return [...reasons].sort();
}

export function summarizeValidation(sim: PairSimResult): RelativeValueValidationSummary {
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

export function assertCostAttribution(sim: PairSimResult, report: RelativeValueReport): void {
  const sumCosts = sim.periods.reduce((sum, p) => sum + p.costPct, 0);
  const attributed =
    report.costAttribution.fees +
    report.costAttribution.slippage +
    report.costAttribution.marketImpact;
  if (Math.abs(attributed - sumCosts) > 1e-12) {
    throw new Error('buildRelativeValueReport: cost attribution total mismatch');
  }
}
