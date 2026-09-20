// Alpha Research Pipeline — Step Data Contracts

import type { EvaluationReport } from '@/forest/alpha/evaluation/report';
import type { AlphaSignal } from '@/tree/alpha/types';
import type { DerivativeFeatures, DerivativeSignal } from '@/tree/alpha/signals';
import type { RegimeResult } from '@/tree/regime/types';
import type { AttributionResult } from '@/forest/alpha/attribution/types';
import type { BaselineConfig } from '@/forest/alpha/baselines/types';
import type { SurvivalGateResult } from '@/forest/alpha/gate/survival-gate';
import type { TransitionResult } from '@/forest/alpha/gate/promotion-states';

export type PipelineStep =
  | 'fetch_data'
  | 'fetch_derivatives'
  | 'compute_indicators'
  | 'detect_regimes'
  | 'generate_signals'
  | 'label_events'
  | 'run_walkforward'
  | 'compute_costs'
  | 'evaluate'
  | 'attribute'
  | 'compare_baselines'
  | 'generate_report';

/** Outcome of a single pipeline step. */
export interface PipelineStepResult {
  step: PipelineStep;
  status: 'success' | 'skipped' | 'error';
  data: unknown;
  duration: number;
  error?: string;
}

/** Data produced by the compute_indicators step. */
export interface IndicatorData {
  features: Record<string, number>[];
  names: string[];
}

/** Data produced by the fetch_derivatives step (non-TA market-structure signals). */
export interface DerivativeData {
  features: DerivativeFeatures[];
  signals: DerivativeSignal[];
}

/** Data produced by the detect_regimes step. */
export interface RegimeData {
  regimes: RegimeResult[];
  history: RegimeResult[];
}

/** Data produced by the generate_signals step. */
export interface SignalData {
  signals: AlphaSignal[];
}

/** Data produced by the label_events step. */
export interface EventData {
  labels: ('buy' | 'sell' | 'hold')[];
}

/** Data produced by run_walkforward step. */
export interface WalkforwardData {
  sharpe: number;
  totalTrades: number;
  passed: boolean;
  result?: unknown;
}

/** Data produced by compute_costs step. */
export interface CostData {
  grossPnl: number;
  netPnl: number;
  fees: number;
  slippage: number;
}

/** Data produced by evaluate step. */
export interface EvalData {
  report: EvaluationReport;
}

/** Data produced by attribute step. */
export interface AttributeData {
  attributions: AttributionResult[];
}

/** Data produced by compare_baselines step. */
export interface BaselineData {
  baselines: BaselineConfig[];
  reports: Record<string, EvaluationReport>;
}

/** Data produced by generate_report step. */
export interface ReportData {
  survivalGate: SurvivalGateResult | null;
  promotion: TransitionResult | null;
}
