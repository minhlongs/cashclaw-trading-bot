// Alpha Research Pipeline — Final Report Contracts

import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { RegimeLabel } from '@/tree/regime/types';
import type { SurvivalGateResult } from '@/forest/alpha/gate/survival-gate';
import type { TransitionResult } from '@/forest/alpha/gate/promotion-states';

/** Regime-level performance breakdown for the final report. */
export interface RegimeBreakdownEntry {
  trades: number;
  winRate: number;
}

/** Top contributing feature. */
export interface TopFeature {
  name: string;
  importance: number;
}

/** Final pipeline recommendation. */
export type PipelineRecommendation = 'deploy' | 'refine' | 'discard';

/** Final alpha research report produced by the pipeline. */
export interface AlphaResearchReport {
  symbol: string;
  timeframe: string;
  totalSteps: number;
  passedSteps: number;
  finalSharpe: number;
  regimeBreakdown: Record<RegimeLabel, RegimeBreakdownEntry>;
  topFeatures: TopFeature[];
  recommendation: PipelineRecommendation;
  report: EvaluationReport | null;
  survivalGate?: SurvivalGateResult | null;
  promotion?: TransitionResult | null;
}
