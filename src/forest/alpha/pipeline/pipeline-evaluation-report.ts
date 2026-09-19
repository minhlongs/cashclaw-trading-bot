// Alpha Research Pipeline — Survival Gate Report Step
// Step: generate_report

import type { PipelineConfig, EvalData, ReportData } from './types';
import { runSurvivalGate } from '@/forest/alpha/gate/survival-gate';
import {
  transitionStrategy,
  gateResultToTrigger,
  canTransition,
} from '@/forest/alpha/gate/promotion-states';

export function stepGenerateReport(cfg: PipelineConfig, map: Map<string, unknown>): ReportData {
  const ev = map.get('evaluate') as EvalData | undefined;
  const evalReport = ev?.report ?? null;
  if (!evalReport) {
    return { survivalGate: null, promotion: null };
  }
  const survivalGate = runSurvivalGate(evalReport, cfg.survivalGateConfig);
  const initialPhase = cfg.initialStrategyPhase ?? 'RESEARCH';
  const trigger = gateResultToTrigger(survivalGate.status);
  const promotion = canTransition(initialPhase, trigger)
    ? transitionStrategy(initialPhase, trigger)
    : null;
  return { survivalGate, promotion };
}
