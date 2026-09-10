// Alpha Research Pipeline — barrel exports

export { AlphaResearchPipeline } from './engine';

export type {
  PipelineConfig,
  PipelineStep,
  PipelineStepResult,
  AlphaResearchReport,
  PipelineRecommendation,
  IndicatorData,
  RegimeData,
  SignalData,
  EventData,
  WalkforwardData,
  CostData,
  EvalData,
  AttributeData,
  BaselineData,
  ReportData,
  RegimeBreakdownEntry,
  TopFeature,
} from './types';
export type { SurvivalGateConfig, SurvivalGateResult } from '@/forest/alpha/gate/survival-gate';
export type { StrategyPhase, TransitionResult } from '@/forest/alpha/gate/promotion-states';
