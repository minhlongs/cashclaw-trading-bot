import { describe, it, expect } from 'vitest';
import { runAutonomousSwarmCycle, getAutomatedCeilingPhase } from './autonomous-swarm';
import type { SwarmExecutionPlan } from './swarm-types';

describe('Autonomous Alpha Lab Swarm', () => {
  const mockPlan: SwarmExecutionPlan = {
    anomaly: {
      symbol: 'BTC/USDT',
      kind: 'funding_extreme',
      metricValue: 0.0008,
      zScore: 3.2,
      timestampMs: 1700000000,
    },
    cumulativeTrials: 10,
    sampleLength: 365,
  };

  it('promotes strong alpha to PAPER candidate phase', () => {
    // Sharpe 2.8 with 10 trials is highly significant
    const outcome = runAutonomousSwarmCycle(mockPlan, 2.8);
    expect(outcome.isPromotedToPaper).toBe(true);
    expect(outcome.targetPhase).toBe('PAPER');
    expect(outcome.deflatedSharpe.isSignificant).toBe(true);
  });

  it('kills candidate when Sharpe fails significance under large cumulative trials', () => {
    const heavilyTestedPlan: SwarmExecutionPlan = {
      ...mockPlan,
      cumulativeTrials: 1000,
    };
    // Sharpe 1.6 fails DSR after 1000 trials
    const outcome = runAutonomousSwarmCycle(heavilyTestedPlan, 1.6);
    expect(outcome.isPromotedToPaper).toBe(false);
    expect(outcome.targetPhase).toBe('KILLED');
  });

  it('enforces automated ceiling invariant as SHADOW', () => {
    expect(getAutomatedCeilingPhase()).toBe('SHADOW');
  });
});
