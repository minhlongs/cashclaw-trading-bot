// Alpha Research Pipeline — step dispatcher and step sequencing.

import type { PipelineConfig, PipelineStep } from './types';
import {
  stepFetchData,
  stepFetchDerivatives,
  stepComputeIndicators,
  stepDetectRegimes,
  stepGenerateSignals,
  stepLabelEvents,
} from './pipeline-signals';
import {
  stepRunWalkforward,
  stepEvaluate,
  stepComputeCosts,
  stepAttribute,
  stepCompareBaselines,
  stepGenerateReport,
} from './pipeline-evaluation';

/** Canonical sequence of steps for an alpha research pipeline run. */
export const PIPELINE_STEPS: readonly PipelineStep[] = [
  'fetch_data',
  'fetch_derivatives',
  'compute_indicators',
  'detect_regimes',
  'generate_signals',
  'label_events',
  'run_walkforward',
  'evaluate',
  'compute_costs',
  'attribute',
  'compare_baselines',
  'generate_report',
];

/** Execute a single named pipeline step using the step configuration and context map. */
export async function executePipelineStep(
  step: PipelineStep,
  cfg: PipelineConfig,
  map: Map<string, unknown>,
): Promise<unknown> {
  switch (step) {
    case 'fetch_data':
      return stepFetchData(cfg);
    case 'fetch_derivatives':
      return stepFetchDerivatives(cfg);
    case 'compute_indicators':
      return stepComputeIndicators(cfg);
    case 'detect_regimes':
      return stepDetectRegimes(cfg);
    case 'generate_signals':
      return stepGenerateSignals(cfg, map);
    case 'label_events':
      return stepLabelEvents(map);
    case 'run_walkforward':
      return stepRunWalkforward(cfg, map);
    case 'evaluate':
      return stepEvaluate(cfg, map);
    case 'compute_costs':
      return stepComputeCosts(map);
    case 'attribute':
      return stepAttribute(cfg, map);
    case 'compare_baselines':
      return stepCompareBaselines(cfg);
    case 'generate_report':
      return stepGenerateReport(cfg, map);
    default:
      return null;
  }
}
