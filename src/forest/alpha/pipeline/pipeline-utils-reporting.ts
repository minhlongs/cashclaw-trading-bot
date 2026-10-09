import { RegimeLabel } from '@/tree/regime/types';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { PipelineStepResult, RegimeData } from './types';

export const TOP_N = 10;
export const elapsed = (t0: number): number => performance.now() - t0;

export function parseCandleIntervalMinutes(timeframe: string): number {
  const m = timeframe.match(/^(\d+)([mhd])$/);
  if (!m) return 60;
  const n = Number(m[1]), u = m[2];
  return u === 'm' ? n : u === 'h' ? n * 60 : u === 'd' ? n * 1440 : 60;
}

export function extractEvalReport(ev: PipelineStepResult | undefined): EvaluationReport | null {
  if (ev?.status !== 'success' || !ev.data) return null;
  const raw = ev.data;
  return typeof raw === 'object' && 'report' in raw ? (raw as { report: EvaluationReport }).report : (raw as EvaluationReport);
}

export function extractRegimeBreakdown(rg: PipelineStepResult | undefined): Record<RegimeLabel, { trades: number; winRate: number }> {
  if (rg?.status !== 'success' || !rg.data) return {} as Record<RegimeLabel, { trades: number; winRate: number }>;
  return (rg.data as RegimeData).regimes.reduce((acc, r) => {
    acc[r.label] = { trades: 0, winRate: 0 };
    return acc;
  }, {} as Record<RegimeLabel, { trades: number; winRate: number }>);
}

export function extractSharpe(wf: PipelineStepResult | undefined): number {
  return wf?.data && typeof wf.data === 'object' && 'sharpe' in wf.data ? (wf.data as { sharpe: number }).sharpe : 0;
}
