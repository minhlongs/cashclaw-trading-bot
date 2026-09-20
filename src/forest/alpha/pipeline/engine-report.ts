// Alpha Research Pipeline — report builder.

import type {
  PipelineConfig,
  PipelineStepResult,
  AlphaResearchReport,
  AttributeData,
  ReportData,
} from './types';
import {
  TOP_N,
  extractSharpe,
  extractEvalReport,
  extractRegimeBreakdown,
} from './pipeline-utils';

/** Build the final `AlphaResearchReport` from the step results. */
export function buildPipelineReport(
  cfg: PipelineConfig,
  results: readonly PipelineStepResult[],
): AlphaResearchReport {
  const wf = results.find((r) => r.step === 'run_walkforward');
  const ev = results.find((r) => r.step === 'evaluate');
  const at = results.find((r) => r.step === 'attribute');
  const rg = results.find((r) => r.step === 'detect_regimes');
  const gr = results.find((r) => r.step === 'generate_report');
  const sp = extractSharpe(wf);
  const attributions = at?.status === 'success' ? (at.data as AttributeData).attributions : [];

  const evalReport = extractEvalReport(ev);
  const repData = gr?.status === 'success' && gr.data ? (gr.data as ReportData) : null;

  return {
    symbol: cfg.symbol,
    timeframe: cfg.timeframe,
    totalSteps: results.length,
    passedSteps: results.filter((r) => r.status === 'success').length,
    finalSharpe: sp,
    regimeBreakdown: extractRegimeBreakdown(rg),
    topFeatures: attributions
      .slice(0, TOP_N)
      .map((a) => ({ name: a.alphaId, importance: a.totalContribution })),
    recommendation:
      sp >= cfg.minSharpe * 1.5 ? 'deploy' : sp >= cfg.minSharpe ? 'refine' : 'discard',
    report: evalReport,
    survivalGate: repData?.survivalGate ?? null,
    promotion: repData?.promotion ?? null,
  };
}
