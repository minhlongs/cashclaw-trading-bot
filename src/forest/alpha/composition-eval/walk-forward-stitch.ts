// Walk-Forward Composition Evaluation — OOS Period Stitching
// Stitches out-of-sample periods across consecutive test windows into a unified equity curve and summary.
// Pure math — no I/O, no network, no ambient clock.

import {
  annualizedSharpe,
  annualizedSortino,
  maxDrawdownPct,
} from '@/forest/alpha/cross-sectional-eval/return-metrics';
import type {
  CompositionEvalConfig,
  CompositionEvalResult,
  CompositionPeriodRecord,
} from './types';

export function stitchOosPeriods(
  periods: readonly CompositionPeriodRecord[],
  config: CompositionEvalConfig,
): CompositionEvalResult {
  if (periods.length === 0) {
    return {
      periods: [],
      equityCurve: [1],
      totalReturn: 0,
      annualizedSharpe: null,
      annualizedSortino: null,
      maxDrawdownPct: 0,
      totalTurnover: 0,
      totalCosts: 0,
    };
  }

  const netReturns = periods.map((p) => p.netReturn);
  const equityCurve: number[] = [1];
  let eq = 1;
  let totalTurnover = 0;
  let totalCosts = 0;

  for (const p of periods) {
    eq *= 1 + p.netReturn;
    equityCurve.push(eq);
    totalTurnover += p.turnover;
    totalCosts += p.costPct;
  }

  return {
    periods,
    equityCurve,
    totalReturn: eq - 1,
    annualizedSharpe: annualizedSharpe(netReturns, config.periodsPerYear),
    annualizedSortino: annualizedSortino(netReturns, config.periodsPerYear),
    maxDrawdownPct: maxDrawdownPct(equityCurve),
    totalTurnover,
    totalCosts,
  };
}
