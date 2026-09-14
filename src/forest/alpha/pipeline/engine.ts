// Alpha Research Pipeline — Engine
// Top-level orchestrator running all steps sequentially with typed handoffs.

import type {
  PipelineConfig,
  PipelineStep,
  PipelineStepResult,
  AlphaResearchReport,
  AttributeData,
  ReportData,
} from './types';
import {
  elapsed,
  TOP_N,
  extractSharpe,
  extractEvalReport,
  extractRegimeBreakdown,
} from './pipeline-utils';
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

export class AlphaResearchPipeline {
  private results: PipelineStepResult[] = [];
  private map = new Map<string, unknown>();
  private stopped = false;

  constructor(private cfg: PipelineConfig) {}

  async run(): Promise<AlphaResearchReport> {
    this.results = [];
    this.map = new Map();
    this.stopped = false;

    // evaluate must come before compute_costs so cost step can read eval results
    const steps: PipelineStep[] = [
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

    for (const step of steps) {
      if (this.stopped) {
        this.results.push({ step, status: 'skipped', data: null, duration: 0 });
        continue;
      }
      const t0 = performance.now();
      try {
        const data = await this.doStep(step);
        this.map.set(step, data);
        this.results.push({ step, status: 'success', data, duration: elapsed(t0) });
        if (step === 'run_walkforward' && !(data as { passed: boolean }).passed) {
          this.stopped = true;
        }
      } catch (err: unknown) {
        if (step === 'run_walkforward') this.stopped = true;
        const m = err instanceof Error ? err.message : String(err);
        this.results.push({ step, status: 'error', data: null, duration: elapsed(t0), error: m });
      }
    }
    return this.report();
  }

  getResults(): PipelineStepResult[] {
    return [...this.results];
  }

  private async doStep(step: PipelineStep): Promise<unknown> {
    switch (step) {
      case 'fetch_data':
        return stepFetchData(this.cfg);
      case 'fetch_derivatives':
        return stepFetchDerivatives(this.cfg);
      case 'compute_indicators':
        return stepComputeIndicators(this.cfg);
      case 'detect_regimes':
        return stepDetectRegimes(this.cfg);
      case 'generate_signals':
        return stepGenerateSignals(this.cfg, this.map);
      case 'label_events':
        return stepLabelEvents(this.map);
      case 'run_walkforward':
        return stepRunWalkforward(this.cfg, this.map);
      case 'evaluate':
        return stepEvaluate(this.cfg, this.map);
      case 'compute_costs':
        return stepComputeCosts(this.map);
      case 'attribute':
        return stepAttribute(this.cfg, this.map);
      case 'compare_baselines':
        return stepCompareBaselines(this.cfg);
      case 'generate_report':
        return stepGenerateReport(this.cfg, this.map);
      default:
        return null;
    }
  }

  private report(): AlphaResearchReport {
    const wf = this.results.find(r => r.step === 'run_walkforward');
    const ev = this.results.find(r => r.step === 'evaluate');
    const at = this.results.find(r => r.step === 'attribute');
    const rg = this.results.find(r => r.step === 'detect_regimes');
    const gr = this.results.find(r => r.step === 'generate_report');
    const sp = extractSharpe(wf);
    const attributions = at?.status === 'success' ? (at.data as AttributeData).attributions : [];

    const evalReport = extractEvalReport(ev);
    const repData = gr?.status === 'success' && gr.data ? (gr.data as ReportData) : null;

    return {
      symbol: this.cfg.symbol,
      timeframe: this.cfg.timeframe,
      totalSteps: this.results.length,
      passedSteps: this.results.filter(r => r.status === 'success').length,
      finalSharpe: sp,
      regimeBreakdown: extractRegimeBreakdown(rg),
      topFeatures: attributions
        .slice(0, TOP_N)
        .map(a => ({ name: a.alphaId, importance: a.totalContribution })),
      recommendation:
        sp >= this.cfg.minSharpe * 1.5 ? 'deploy' : sp >= this.cfg.minSharpe ? 'refine' : 'discard',
      report: evalReport,
      survivalGate: repData?.survivalGate ?? null,
      promotion: repData?.promotion ?? null,
    };
  }
}
