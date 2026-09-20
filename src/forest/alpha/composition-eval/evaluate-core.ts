// Composition evaluation core loop.

import type { ComposedAlpha } from '@/tree/alpha/composition';
import { scoreComposedAlphas } from '@/tree/alpha/composition/scoring';
import type { RiskInputs } from '@/tree/alpha/portfolio';
import { buildPortfolio } from '@/tree/alpha/portfolio/engine';
import { annualizedSharpe, annualizedSortino, maxDrawdownPct } from '@/forest/alpha/cross-sectional-eval/return-metrics';
import type { CompositionEvalConfig, CompositionPeriodRecord, CompositionEvalResult } from './types';
import { resolveCostFraction } from './evaluate-cost';
import { buildEquityCurve } from './evaluate-equity';
import { toWeightMap, EMPTY_EVAL_RESULT, createEmptyPeriod } from './evaluate-core-helpers';

export { toWeightMap, EMPTY_EVAL_RESULT };

/**
 * Evaluate a composition pipeline end to end.
 *
 * Contract: each key `t` in `alphasAtEachT` is one decision time; alphas at
 * key `t` are available at that time (caller enforces causal ordering).
 *
 * Return semantics: `returnSeriesAtEachT.get(t)` is the return earned via
 * the position decided at `t` over the subsequent period.
 *
 * FAIL-CLOSED: missing return/riskInputs keys that alphas exist for → THROW.
 */
export function evaluateComposition(
  alphasAtEachT: ReadonlyMap<number, readonly ComposedAlpha[]>,
  returnSeriesAtEachT: ReadonlyMap<number, number>,
  riskInputsAtEachT: ReadonlyMap<number, RiskInputs>,
  config: CompositionEvalConfig,
): CompositionEvalResult {
  if (alphasAtEachT.size === 0) {
    return EMPTY_EVAL_RESULT;
  }

  const costFraction = resolveCostFraction(config);
  const sortedTs = [...alphasAtEachT.keys()].sort((a, b) => a - b);

  const periods: CompositionPeriodRecord[] = [];
  const netReturns: number[] = [];
  let prevWeights: ReadonlyMap<string, number> = new Map();
  let totalTurnover = 0;
  let totalCosts = 0;

  for (const t of sortedTs) {
    const alphas = alphasAtEachT.get(t)!;

    const ret = returnSeriesAtEachT.get(t);
    if (ret === undefined) {
      throw new Error(
        `evaluateComposition: missing return for decision time ${t}`,
      );
    }
    const risk = riskInputsAtEachT.get(t);
    if (risk === undefined) {
      throw new Error(
        `evaluateComposition: missing riskInputs for decision time ${t}`,
      );
    }

    const { scored } = scoreComposedAlphas(alphas, config.compositionConfig);

    if (scored.length === 0) {
      periods.push(createEmptyPeriod(t));
      netReturns.push(0);
      continue;
    }

    const portfolio = buildPortfolio(scored, prevWeights, risk, config.portfolioConfig);

    let grossReturn = 0;
    for (const pos of portfolio.positions) {
      grossReturn += pos.targetWeight * ret;
    }

    const costPct = portfolio.totalTurnover * costFraction;
    const netReturn = grossReturn - costPct;

    periods.push({
      timestamp: t,
      scoredAlphas: scored.map(({ alpha, score }) => ({
        alphaId: alpha.alphaId,
        score,
      })),
      positions: portfolio.positions.map((p) => ({
        alphaId: p.alphaId,
        weight: p.targetWeight,
      })),
      grossReturn,
      costPct,
      netReturn,
      turnover: portfolio.totalTurnover,
      riskAdjustments: portfolio.riskAdjustments,
    });
    netReturns.push(netReturn);
    totalTurnover += portfolio.totalTurnover;
    totalCosts += costPct;

    prevWeights = toWeightMap(portfolio.positions);
  }

  const { equityCurve, totalReturn } = buildEquityCurve(netReturns);

  return {
    periods,
    equityCurve,
    totalReturn,
    annualizedSharpe: annualizedSharpe(netReturns, config.periodsPerYear),
    annualizedSortino: annualizedSortino(netReturns, config.periodsPerYear),
    maxDrawdownPct: maxDrawdownPct(equityCurve),
    totalTurnover,
    totalCosts,
  };
}
