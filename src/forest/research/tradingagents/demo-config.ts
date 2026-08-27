// Demo config — fixed ResearchGoal + injected data for the deliberation demo.
// Shared by scripts/tradingagents-deliberation-demo.ts and the consistency
// test so both run the IDENTICAL deterministic pipeline. Uses
// DeterministicFixtureProvider (D11 labeled TEST seam) — not real LLM quality.

import type { RunDeliberationConfig } from './run-deliberation';
import { createModelRouter } from './model-router';
import { DeterministicFixtureProvider } from './test-fixtures';
import type { ResearchGoal } from '@/tree/research/goals/types';
import type { DataWindow } from '@/tree/research/alpha/experiment-spec';
import type { Universe } from '@/tree/alpha/universe/types';
import type { StressMode } from '@/forest/backtest/cost-model';
import type { PortfolioConfig, RiskInputs } from '@/tree/alpha/portfolio/types';
import type { ComposedAlpha } from '@/tree/alpha/composition/types';
import { RegimeLabel } from '@/tree/regime/types';

/** Fixed demo timestamp (deterministic). */
export const DEMO_NOW_ISO = '2026-08-26T00:00:00.000Z';

const RESEARCH_GOAL: ResearchGoal = {
  id: 'goal-demo',
  objective: 'Determine whether momentum persists in trending regime',
  universe: { id: 'universe-demo', symbols: ['BTC-USD'], weighting: 'equal', rebalanceRule: 'daily' },
  timePeriod: { start: '2026-01-01T00:00:00.000Z', end: '2026-08-26T00:00:00.000Z' },
  constraints: ['paper only'],
  evidenceRequirements: ['OOS evidence'],
  successCriteria: ['directional accuracy > 0.5'],
  failureCriteria: ['directional accuracy <= 0.5'],
  createdAt: DEMO_NOW_ISO,
  createdBy: 'deliberation-demo',
};

const DATA_WINDOW: DataWindow = {
  earliestTimestamp: Date.parse('2026-01-01T00:00:00.000Z'),
  latestTimestamp: Date.parse('2026-08-26T00:00:00.000Z'),
  barCount: 1000,
};

const UNIVERSE: Universe = {
  id: 'universe-demo',
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
  timestamp: Date.parse(DEMO_NOW_ISO),
}];

/** Build the deterministic demo deliberation config. */
export function buildDemoConfig(): RunDeliberationConfig {
  const routerResult = createModelRouter([new DeterministicFixtureProvider()]);
  if (!routerResult.ok) {
    throw new Error(`demo router: ${routerResult.reasons.join('; ')}`);
  }
  return {
    router: routerResult.router,
    researchGoal: RESEARCH_GOAL,
    proposalId: 'prop-demo',
    nowIso: DEMO_NOW_ISO,
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
