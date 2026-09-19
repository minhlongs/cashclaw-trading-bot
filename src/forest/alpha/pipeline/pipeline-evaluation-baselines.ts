// Alpha Research Pipeline — Baseline Comparison Step
// Step: compare_baselines

import type { BaselineConfig, BaselineStrategy } from '@/forest/alpha/baselines/types';
import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { StressMode } from '@/forest/backtest/cost-model';
import { runBaseline } from '@/forest/alpha/baselines';
import type { PipelineConfig, BaselineData } from './types';

export function stepCompareBaselines(cfg: PipelineConfig): BaselineData {
  if (!cfg.baselinesEnabled) return { baselines: [], reports: {} };
  const sm = cfg.costMode as StressMode;
  const baselineStrategies: BaselineStrategy[] = ['buy_hold', 'simple_momentum'];
  const configs: BaselineConfig[] = baselineStrategies.map(s => ({
    strategy: s,
    symbol: cfg.symbol,
    timeframe: cfg.timeframe,
    stressMode: sm,
    feePct: 0.001,
    slipPct: 0.0005,
  }));
  const reports: Record<string, EvaluationReport> = {};
  for (const c of configs) {
    reports[c.strategy] = runBaseline(cfg.candles, c);
  }
  return { baselines: configs, reports };
}
