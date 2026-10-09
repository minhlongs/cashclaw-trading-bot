import type { CrossSectionalSimResult } from '@/tree/alpha/cross-sectional/types';
import type { CrossSectionalReport } from './types';
import type { BuildReportConfig } from './report.config';
import { computeReportMetrics } from './report.builder-metrics';
import { computeReportRegimeBreakdown } from './report.builder-regime';

function validateReportConfig(periodsLen: number, config: BuildReportConfig): void {
  if (!Number.isFinite(config.periodsPerYear) || config.periodsPerYear <= 0) {
    throw new Error('buildCrossSectionalReport: periodsPerYear must be positive finite');
  }
  if (config.assetPeriodReturns && config.assetPeriodReturns.length !== periodsLen) {
    throw new Error(`buildCrossSectionalReport: assetPeriodReturns length (${config.assetPeriodReturns.length}) !== periods.length (${periodsLen})`);
  }
  if (config.regimeLabels && config.regimeLabels.length !== periodsLen) {
    throw new Error(`buildCrossSectionalReport: regimeLabels length (${config.regimeLabels.length}) !== periods.length (${periodsLen})`);
  }
}

export function buildCrossSectionalReport(
  simResult: CrossSectionalSimResult, config: BuildReportConfig,
): CrossSectionalReport {
  validateReportConfig(simResult.periods.length, config);
  const m = computeReportMetrics(simResult, config);
  const byRegime = computeReportRegimeBreakdown(simResult, config);
  return {
    experimentId: config.experimentId, symbol: config.symbol, timeframe: config.timeframe,
    regime: config.regime, totalReturn: m.totalReturn, grossReturn: m.grossReturn, netReturn: m.totalReturn,
    annualizedSharpe: m.annualizedSharpeVal, annualizedSortino: m.annualizedSortinoVal,
    maxDrawdownPct: m.maxDrawdownPctVal, turnoverTotal: m.turnoverTotal,
    turnoverPerRebalance: m.turnoverPerRebalance, costAttribution: m.costAttribution,
    longSidePnl: m.longSidePnl, shortSidePnl: m.shortSidePnl, exposureSeries: m.exposureSeries,
    realizedBetaSeries: [], byRegime, periodCount: simResult.periods.length, periodsPerYear: config.periodsPerYear,
  };
}
