// Composition evaluation seam — score → portfolio → report.
// Wire-in seam composing composition scoring, portfolio construction, and
// performance metrics (plan §6+§7). Pure orchestration — no I/O, no network,
// no ambient randomness or clock access.
//
// Composition order: validate inputs → per-decision-time scoring
// (scoreComposedAlphas) → portfolio construction (buildPortfolio) →
// gross/net return computation → equity curve → performance report.
// Errors propagate verbatim — nothing is swallowed (fail-closed).

import type { ComposedAlpha } from '@/tree/alpha/composition';
import { scoreComposedAlphas } from '@/tree/alpha/composition/scoring';
import type { RiskInputs } from '@/tree/alpha/portfolio';
import { buildPortfolio } from '@/tree/alpha/portfolio/engine';
import { resolveStressConfig } from '@/tree/alpha/cost-stress';
import {
  annualizedSharpe,
  annualizedSortino,
  maxDrawdownPct,
} from '@/forest/alpha/cross-sectional-eval/return-metrics';
import type {
  CompositionEvalConfig,
  CompositionPeriodRecord,
  CompositionEvalResult,
} from './types';

/**
 * Resolve cost fraction for one period from config.
 * costBps/10_000 takes priority; falls back to sum of stress components.
 */
function resolveCostFraction(config: CompositionEvalConfig): number {
  if (config.costBps !== undefined) {
    return config.costBps / 10_000;
  }
  const stress = resolveStressConfig(config.stressMode ?? 'conservative');
  return stress.feePct + stress.slipPct + stress.marketImpactPct;
}

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
      const period: CompositionPeriodRecord = {
        timestamp: t,
        scoredAlphas: [],
        positions: [],
        grossReturn: 0,
        costPct: 0,
        netReturn: 0,
        turnover: 0,
        riskAdjustments: [],
      };
      periods.push(period);
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

    const scoredSnapshot = scored.map(({ alpha, score }) => ({
      alphaId: alpha.alphaId,
      score,
    }));

    const period: CompositionPeriodRecord = {
      timestamp: t,
      scoredAlphas: scoredSnapshot,
      positions: portfolio.positions.map((p) => ({
        alphaId: p.alphaId,
        weight: p.targetWeight,
      })),
      grossReturn,
      costPct,
      netReturn,
      turnover: portfolio.totalTurnover,
      riskAdjustments: portfolio.riskAdjustments,
    };
    periods.push(period);
    netReturns.push(netReturn);
    totalTurnover += portfolio.totalTurnover;
    totalCosts += costPct;

    prevWeights = toWeightMap(portfolio.positions);
  }

  // Equity curve: starts at 1.0, length = periods.length + 1.
  const equityCurve: number[] = [1];
  let equity = 1;
  for (const r of netReturns) {
    equity *= 1 + r;
    equityCurve.push(equity);
  }

  return {
    periods,
    equityCurve,
    totalReturn: equity - 1,
    annualizedSharpe: annualizedSharpe(netReturns, config.periodsPerYear),
    annualizedSortino: annualizedSortino(netReturns, config.periodsPerYear),
    maxDrawdownPct: maxDrawdownPct(equityCurve),
    totalTurnover,
    totalCosts,
  };
}

function toWeightMap(positions: readonly { alphaId: string; targetWeight: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of positions) m.set(p.alphaId, p.targetWeight);
  return m;
}
