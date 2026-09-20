// Alpha Research Pipeline — orchestrator facade.
// Coordinates step execution and report generation.

import type {
  PipelineConfig,
  PipelineStepResult,
  AlphaResearchReport,
} from './types';
import { elapsed } from './pipeline-utils';
import { PIPELINE_STEPS, executePipelineStep } from './engine-steps';
import { buildPipelineReport } from './engine-report';

export { PIPELINE_STEPS, executePipelineStep } from './engine-steps';
export { buildPipelineReport } from './engine-report';

export class AlphaResearchPipeline {
  private results: PipelineStepResult[] = [];
  private map = new Map<string, unknown>();
  private stopped = false;

  constructor(private cfg: PipelineConfig) {}

  async run(): Promise<AlphaResearchReport> {
    this.results = [];
    this.map = new Map();
    this.stopped = false;

    for (const step of PIPELINE_STEPS) {
      if (this.stopped) {
        this.results.push({ step, status: 'skipped', data: null, duration: 0 });
        continue;
      }
      const t0 = performance.now();
      try {
        const data = await executePipelineStep(step, this.cfg, this.map);
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
    return buildPipelineReport(this.cfg, this.results);
  }

  getResults(): PipelineStepResult[] {
    return [...this.results];
  }
}
