import type { CrossSectionalSimResult } from '@/tree/alpha/cross-sectional/types';
import type { CostAttributionBreakdown, ExposureSeries } from './types';
import { annualizedSharpe, annualizedSortino, maxDrawdownPct, compoundReturn } from './return-metrics';
import { attributeLongShortProportional, attributeLongShortPrecise, attributeCosts } from './attribution';
import type { BuildReportConfig } from './report.config';

export function computeReportMetrics(simResult: CrossSectionalSimResult, config: BuildReportConfig): {
  totalReturn: number; grossReturn: number; annualizedSharpeVal: number | null;
  annualizedSortinoVal: number | null; maxDrawdownPctVal: number; turnoverTotal: number;
  turnoverPerRebalance: number[]; costAttribution: CostAttributionBreakdown;
  longSidePnl: number; shortSidePnl: number; exposureSeries: ExposureSeries;
} {
  const { periods, equityCurve } = simResult;
  const netReturns = periods.map((p) => p.netReturn), grossReturns = periods.map((p) => p.grossReturn);
  const totalReturn = compoundReturn(netReturns), grossReturn = compoundReturn(grossReturns);
  const annualizedSharpeVal = annualizedSharpe(netReturns, config.periodsPerYear);
  const annualizedSortinoVal = annualizedSortino(netReturns, config.periodsPerYear);
  const maxDrawdownPctVal = maxDrawdownPct(equityCurve);
  const turnoverTotal = periods.reduce((s, p) => s + p.turnover, 0);
  const turnoverPerRebalance = periods.map((p) => p.turnover);
  const costAttribution = attributeCosts(periods, config.stressMode ?? 'conservative');
  let longSidePnl = 0, shortSidePnl = 0;
  if (config.assetPeriodReturns !== undefined && config.assetPeriodReturns.length > 0) {
    const precise = attributeLongShortPrecise(config.assetPeriodReturns);
    longSidePnl = precise.longSidePnl;
    shortSidePnl = precise.shortSidePnl;
  } else {
    const prop = attributeLongShortProportional(periods);
    longSidePnl = prop.longSidePnl;
    shortSidePnl = prop.shortSidePnl;
  }
  const exposureSeries: ExposureSeries = {
    gross: periods.map((p) => p.grossExposure),
    net: periods.map((p) => p.netExposure),
  };
  return {
    totalReturn, grossReturn, annualizedSharpeVal, annualizedSortinoVal, maxDrawdownPctVal,
    turnoverTotal, turnoverPerRebalance, costAttribution, longSidePnl, shortSidePnl, exposureSeries,
  };
}
