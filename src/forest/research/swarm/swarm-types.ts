// Autonomous Alpha Lab Swarm Types
// ADR-001 Invariant: Paper-only research execution contracts

import type { DeflatedSharpeResult } from './deflated-sharpe';
import type { StrategyPhase } from '@/forest/alpha/gate/promotion-states-types';

export interface MarketAnomaly {
  readonly symbol: string;
  readonly kind: 'funding_extreme' | 'oi_spike' | 'volatility_breakout';
  readonly metricValue: number;
  readonly zScore: number;
  readonly timestampMs: number;
}

export interface SwarmExecutionPlan {
  readonly anomaly: MarketAnomaly;
  readonly cumulativeTrials: number;
  readonly sampleLength: number;
}

export interface SwarmEvaluationOutcome {
  readonly anomaly: MarketAnomaly;
  readonly estimatedSharpe: number;
  readonly deflatedSharpe: DeflatedSharpeResult;
  readonly targetPhase: StrategyPhase;
  readonly isPromotedToPaper: boolean;
}
