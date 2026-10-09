import { describe, it, expect } from 'vitest';
import { AmihudIlliqEngine } from '../../src/tree/quantlib/liquidity/amihud-illiq-engine';
import { ContDeLarrardQueueEngine } from '../../src/tree/quantlib/microstructure/cont-delarrard-queue-engine';
import { cleanJsonString, parseRawJson } from '../../src/forest/alpha/research-agent/schemas';
import { createFollowUpJobSpec } from '../../src/forest/alpha/research-agent/seam';
import type { ResearchQueueJob } from '../../src/tree/alpha/queue/types';

describe('v16 Apex Multi-Domain Suite E2E Simulation', () => {
  it('integrates Amihud illiquidity with Cont-de Larrard queue execution probability', () => {
    const illiqEngine = new AmihudIlliqEngine({
      minObservations: 3,
      illiquidityThreshold: 0.1,
    });
    const bars = [
      { returnPct: 0.05, volumeUsd: 50000 },
      { returnPct: -0.04, volumeUsd: 40000 },
      { returnPct: 0.06, volumeUsd: 60000 },
    ];
    const illiqResult = illiqEngine.estimateIlliquidity(bars);
    expect(illiqResult.isIlliquidRegime).toBe(true);

    const queueEngine = new ContDeLarrardQueueEngine({
      queueDepth: 10,
      cancellationRate: 0.1,
      orderFlowIntensity: 2.0,
      highProbThreshold: 0.5,
    });
    const fillResult = queueEngine.computeFillProbability(2);
    expect(fillResult.fillProbability).toBeGreaterThan(0.5);
    expect(fillResult.isHighExecutionProbability).toBe(true);
  });

  it('verifies research-agent modular JSON parsing and follow-up job synthesis', () => {
    const rawFenced = '```json\n{"alpha": "v16-apex", "score": 0.95}\n```';
    expect(cleanJsonString(rawFenced)).toBe('{"alpha": "v16-apex", "score": 0.95}');
    const parsed = parseRawJson(rawFenced, 'simulation') as { alpha: string; score: number };
    expect(parsed.alpha).toBe('v16-apex');

    const mockJob: ResearchQueueJob = {
      id: 'job-v16-root',
      hypothesis: 'Cont-de Larrard Microstructure Queue Alpha',
      rationale: 'High fill probability predicts short-term momentum',
      features: ['illiq_ratio', 'queue_fill_prob'],
      dataset: 'binance-btc-usdt-1m',
      regime: 'TRENDING_BULL',
      universe: {
        id: 'crypto-top3',
        symbols: ['BTC', 'ETH', 'SOL'],
        weighting: 'equal',
        rebalanceRule: 'daily',
      },
      costs: { feeBps: 10, impactBps: 5 },
      slippage: { slippageBps: 2 },
      seed: null,
      parentHypothesis: null,
      generatedBy: 'research-agent-seam',
      timestamp: Date.now(),
      gitSha: 'v16apex00',
      status: 'FALSIFIED',
      configHash: 'hash-v16-01',
      result: null,
    };

    const spec = createFollowUpJobSpec(mockJob, {
      hypothesisId: 'hypo-v16',
      title: 'Cont-de Larrard Queue Refinement',
      proposedParameters: { features: ['queue_fill_prob_v2'] },
      rationale: 'Refine queue depth sensitivity',
    });

    expect(spec.features).toEqual(['queue_fill_prob_v2']);
    expect(spec.parentHypothesis).toBe('job-v16-root');
  });
});
