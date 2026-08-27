// run-deliberation tests — top-level seam: ResearchGoal → DeliberationReport.
// Full pipeline on DeterministicFixtureProvider (D11 labeled TEST seam).
// Replay determinism (run twice → byte-identical report).

import { describe, expect, it } from 'vitest';
import { createModelRouter } from './model-router';
import { DeterministicFixtureProvider } from './test-fixtures';
import { runDeliberation, type RunDeliberationConfig } from './run-deliberation';
import { canonicalize } from '@/lib/canonical-json';
import type { ResearchGoal } from '@/tree/research/goals/types';
import type { DataWindow } from '@/tree/research/alpha/experiment-spec';
import type { Universe } from '@/tree/alpha/universe/types';
import type { StressMode } from '@/forest/backtest/cost-model';
import type { PortfolioConfig, RiskInputs } from '@/tree/alpha/portfolio/types';
import type { ComposedAlpha } from '@/tree/alpha/composition/types';
import { RegimeLabel } from '@/tree/regime/types';

const NOW = '2026-08-26T00:00:00.000Z';

const RESEARCH_GOAL: ResearchGoal = {
  id: 'goal-1',
  objective: 'Determine whether momentum persists in trending regime',
  universe: { id: 'universe-1', symbols: ['BTC-USD'], weighting: 'equal', rebalanceRule: 'daily' },
  timePeriod: { start: '2026-01-01T00:00:00.000Z', end: '2026-08-26T00:00:00.000Z' },
  constraints: ['paper only'],
  evidenceRequirements: ['OOS evidence'],
  successCriteria: ['directional accuracy > 0.5'],
  failureCriteria: ['directional accuracy <= 0.5'],
  createdAt: NOW,
  createdBy: 'test',
};

const DATA_WINDOW: DataWindow = {
  earliestTimestamp: Date.parse('2026-01-01T00:00:00.000Z'),
  latestTimestamp: Date.parse('2026-08-26T00:00:00.000Z'),
  barCount: 1000,
};

const UNIVERSE: Universe = {
  id: 'universe-1',
  symbols: ['BTC-USD'],
  weighting: 'equal',
  rebalanceRule: 'daily',
};

const PORTFOLIO_CONFIG: PortfolioConfig = {
  targetVolatility: 0.15,
  maxPositionWeight: 0.3,
  maxGrossExposure: 0.8,
  maxNetExposure: 0.5,
  maxCorrelatedExposure: 0.4,
  correlationBucketThreshold: 0.7,
  maxBetaExposure: 0.3,
  maxTurnover: 0.5,
  drawdownThreshold: 0.1,
  deRiskFactor: 0.5,
};

const RISK_INPUTS: RiskInputs = {
  realizedVolatility: 0.2,
  correlationMatrix: new Map([['BTC-USD', new Map([['BTC-USD', 1.0]])]]),
  betas: new Map([['BTC-USD', 1.0]]),
  currentDrawdown: 0.02,
};

const COMPOSED_ALPHAS: ComposedAlpha[] = [{
  alphaId: 'alpha-momentum',
  direction: 'buy',
  confidence: 0.6,
  expectedReturn: 0.02,
  expectedCost: 0.001,
  expectedTurnover: 0.1,
  regime: RegimeLabel.TREND_UP,
  horizon: '20d',
  provenance: 'deliberation',
  featureDependencies: ['momentum_20d'],
  timestamp: Date.parse(NOW),
}];

function makeConfig(): RunDeliberationConfig {
  const routerResult = createModelRouter([new DeterministicFixtureProvider()]);
  if (!routerResult.ok) throw new Error(`router: ${routerResult.reasons.join('; ')}`);
  return {
    router: routerResult.router,
    researchGoal: RESEARCH_GOAL,
    proposalId: 'prop-1',
    nowIso: NOW,
    maxDebateRounds: 1,
    dataWindow: DATA_WINDOW,
    universe: UNIVERSE,
    timeframe: '1d',
    importerVersion: 'deliberation-adapter@1',
    defaultCostMode: 'normal' as StressMode,
    portfolioConfig: PORTFOLIO_CONFIG,
    riskInputs: RISK_INPUTS,
    currentWeights: new Map(),
    composedAlphas: COMPOSED_ALPHAS,
  };
}

describe('runDeliberation', () => {
  it('runs the full pipeline and returns a valid report', async () => {
    const result = await runDeliberation(makeConfig());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.researchGoalId).toBe('goal-1');
      expect(result.report.proposalId).toBe('prop-1');
      expect(result.report.hypotheses.length).toBe(2);
      expect(result.report.decisionProposal.thesis.length).toBeGreaterThan(0);
      expect(result.report.totals.total).toBe(result.report.stageResults.length);
    }
  });

  it('replay determinism: two runs produce byte-identical reports', async () => {
    const r1 = await runDeliberation(makeConfig());
    const r2 = await runDeliberation(makeConfig());
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(canonicalize(r1.report)).toBe(canonicalize(r2.report));
    }
  });

  it('decision log is produced and valid', async () => {
    const result = await runDeliberation(makeConfig());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decisionLog.length).toBeGreaterThan(0);
      const parsed = JSON.parse(result.decisionLog);
      expect(Array.isArray(parsed.entries)).toBe(true);
      expect(parsed.entries.length).toBeGreaterThan(0);
    }
  });

  it('Σ≡N invariant holds on the report', async () => {
    const result = await runDeliberation(makeConfig());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const { totals, stageResults } = result.report;
      const bucketSum = totals.completed + totals.failed + totals.skipped + totals.rejected;
      expect(bucketSum).toBe(stageResults.length);
      expect(totals.total).toBe(stageResults.length);
    }
  });
});