// Composition evaluation core helpers — weight map + empty result constant.

import type { CompositionEvalResult, CompositionPeriodRecord } from './types';

export function toWeightMap(
  positions: readonly { alphaId: string; targetWeight: number }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of positions) m.set(p.alphaId, p.targetWeight);
  return m;
}

export function createEmptyPeriod(timestamp: number): CompositionPeriodRecord {
  return {
    timestamp,
    scoredAlphas: [],
    positions: [],
    grossReturn: 0,
    costPct: 0,
    netReturn: 0,
    turnover: 0,
    riskAdjustments: [],
  };
}

export const EMPTY_EVAL_RESULT: CompositionEvalResult = {
  periods: [],
  equityCurve: [1],
  totalReturn: 0,
  annualizedSharpe: null,
  annualizedSortino: null,
  maxDrawdownPct: 0,
  totalTurnover: 0,
  totalCosts: 0,
};
