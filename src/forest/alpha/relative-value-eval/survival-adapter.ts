// Survival evaluation adapters for relative-value results.
// Maps stitched relative-value OOS output into EvaluationReport shapes consumed by evaluateSurvival() and runSurvivalGate().

import { RegimeLabel } from '@/tree/regime/types';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { PairPeriodRecord } from '@/tree/alpha/relative-value';
import type { StressMode } from '@/tree/alpha/cost-stress';
import {
  annualizedSharpe, annualizedSortino, compoundReturn, maxDrawdownPct,
} from '@/forest/alpha/cross-sectional-eval/return-metrics';
import { attributeCosts } from '@/forest/alpha/cross-sectional-eval/attribution';
import { extractRoundTrips } from './round-trips';
import { equityCurve, medianOf, singleRegimeBucket } from './survival-adapter-helpers';

/** Identity + metric options for mapping RV output into EvaluationReport. */
export interface RVAdapterOptions {
  readonly experimentId: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly periodsPerYear: number;
  readonly stressMode?: StressMode;
}

export function toEvaluationReport(
  oosPeriods: readonly PairPeriodRecord[],
  options: RVAdapterOptions,
): EvaluationReport {
  if (!Number.isFinite(options.periodsPerYear) || options.periodsPerYear <= 0) {
    throw new Error('toEvaluationReport: periodsPerYear must be positive finite');
  }
  if (oosPeriods.length === 0) {
    throw new Error('toEvaluationReport: no OOS periods supplied (fail-closed)');
  }

  const netReturns = oosPeriods.map((p) => p.netReturn);
  const totalReturn = compoundReturn(netReturns);
  const drawdown = maxDrawdownPct(equityCurve(netReturns)) / 100;
  const costs = attributeCosts(oosPeriods, options.stressMode ?? 'conservative');

  // Trade-level metrics follow the round-trip conventions of report.ts:
  // completed trades only; PF serializes to 0 when undefined.
  const { roundTrips } = extractRoundTrips(oosPeriods);
  const tripNets = roundTrips.map((t) => t.netReturn);
  const grossProfit = tripNets.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(tripNets.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  const rawProfitFactor =
    grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const expectancy =
    tripNets.length > 0 ? tripNets.reduce((a, b) => a + b, 0) / tripNets.length : 0;
  const winRate = tripNets.length > 0
    ? tripNets.filter((r) => r > 0).length / tripNets.length
    : 0;

  return {
    experimentId: options.experimentId,
    symbol: options.symbol,
    timeframe: options.timeframe,
    regime: RegimeLabel.UNKNOWN,
    totalReturn,
    netPnl: totalReturn,
    cagr: 0, // stitched multi-pair span has no single-price CAGR basis
    winRate,
    lossRate: 1 - winRate,
    profitFactor: Number.isFinite(rawProfitFactor) ? rawProfitFactor : 0,
    expectancy,
    sharpe: annualizedSharpe(netReturns, options.periodsPerYear),
    sortino: annualizedSortino(netReturns, options.periodsPerYear),
    maxDrawdown: drawdown, // fraction — gate threshold semantics (0.3 = 30%)
    avgTrade: expectancy,
    medianTrade: medianOf(tripNets),
    numTrades: roundTrips.length,
    turnover: oosPeriods.reduce((sum, p) => sum + p.turnover, 0),
    fees: costs.fees,
    slippage: costs.slippage,
    exposure:
      oosPeriods.reduce((sum, p) => sum + p.grossExposure, 0) / oosPeriods.length,
    recoveryFactor: drawdown > 0 ? Math.abs(totalReturn / drawdown) : 0,
    byRegime: singleRegimeBucket({
      numTrades: roundTrips.length,
      expectancy,
      profitFactor: Number.isFinite(rawProfitFactor) ? rawProfitFactor : 0,
      netPnl: totalReturn,
    }),
    byMonth: {},
    byVolBucket: {},
    byDuration: { short: {}, medium: {}, long: {} },
  };
}
