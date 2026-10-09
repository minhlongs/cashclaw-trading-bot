import type { RegimePerformance } from '@/forest/alpha/experiments/types';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import { RegimeLabel } from '@/tree/regime/types';
import type { RegimeAnalysis, RegimeAnalysisEntry } from './generator';

export function buildRegimeAnalysis(regimePerf: RegimePerformance | undefined): RegimeAnalysis {
  const empty: RegimeAnalysisEntry = { trades: 0, winRate: 0, avgPnL: 0 };
  return Object.values(RegimeLabel).reduce<RegimeAnalysis>((acc, label) => {
    const entry = regimePerf?.[label];
    const trades = entry ? entry.sampleCount : 0;
    const avgPnL = trades > 0 ? entry!.totalPnl / trades : 0;
    acc[label] = entry ? { trades, winRate: entry.winRate, avgPnL } : { ...empty };
    return acc;
  }, {} as RegimeAnalysis);
}

export function baselineDelta(evalReport: EvaluationReport, baselinePnl: number | null): number | null {
  if (baselinePnl === null) return null;
  const strategyPnl = evalReport.netPnl;
  if (baselinePnl === 0) return strategyPnl === 0 ? 0 : strategyPnl > 0 ? Infinity : -Infinity;
  return strategyPnl - baselinePnl;
}
