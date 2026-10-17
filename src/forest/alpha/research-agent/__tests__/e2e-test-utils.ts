export * from '../index';
export { SEED_FALSIFIED } from '@/tree/alpha/registry/seed-falsified';
export type { ResearchQueueJob } from '@/tree/alpha/queue/types';
export type { SurvivalVerdict } from '@/forest/alpha/multiple-testing/types';
export { validateJobSpec } from '@/tree/alpha/queue/validation';
export { MICROSTRUCTURE_FEATURE_NAMES } from '@/tree/alpha/microstructure/contracts';

import type { ResearchQueueJob } from '@/tree/alpha/queue/types';
import type { SurvivalVerdict } from '@/forest/alpha/multiple-testing/types';

/** Creates a sample ResearchQueueJob fixture for testing. */
export function createMockQueueJob(overrides: Partial<ResearchQueueJob> = {}): ResearchQueueJob {
  return {
    id: 'job-e2e-funding-fade-001',
    hypothesis: 'Funding rate fade yields net edge during ranging markets',
    rationale: 'Funding rate extremes lead to mean reversion when spot momentum stalls',
    features: ['funding-rate', 'volume_delta'],
    dataset: 'binance-derivatives-1h',
    regime: 'ranging_low_vol',
    universe: {
      id: 'perp-majors',
      symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
      weighting: 'equal',
      rebalanceRule: 'none',
    },
    costs: { feeBps: 10, impactBps: 10 },
    slippage: { slippageBps: 7 },
    seed: null,
    parentHypothesis: null,
    generatedBy: 'test-suite',
    timestamp: 1727193600000,
    gitSha: 'abcdef1234567890',
    status: 'FALSIFIED',
    configHash: 'hash-config-001',
    result: {
      oosPassCount: 1,
      oosTotalCount: 6,
      aggregatePnlUsd: -18500,
      summary: '1/6 OOS pass; failed cost stress test at 27 bps round-trip',
    },
    ...overrides,
  };
}

/** Creates a sample falsified SurvivalVerdict fixture for testing. */
export function createMockSurvivalVerdict(overrides: Partial<SurvivalVerdict> = {}): SurvivalVerdict {
  return {
    verdict: 'falsified',
    reasons: [
      'Bootstrap CI lower bound (-0.0012) <= 0',
      'Walk-forward sign flips (3) exceeded ceiling (2)',
      'Adverse fee stress test net PnL < 0 (-$18,500)',
    ],
    ...overrides,
  };
}
