// Autonomous Alpha Lab Swarm Orchestrator
// Pure coordination function connecting market anomaly, DSR defense, and promotion ceiling

import type { SwarmExecutionPlan, SwarmEvaluationOutcome } from './swarm-types';
import { computeDeflatedSharpe } from './deflated-sharpe';
import { AUTOMATED_CEILING } from '@/forest/alpha/gate/promotion-states-types';

export function runAutonomousSwarmCycle(
  plan: SwarmExecutionPlan,
  rawEstimatedSharpe: number,
): SwarmEvaluationOutcome {
  const deflatedSharpe = computeDeflatedSharpe({
    estimatedSharpe: rawEstimatedSharpe,
    sampleLength: plan.sampleLength,
    numTrials: plan.cumulativeTrials,
  });

  // Strict gating: Only advance if statistically significant under cumulative multiple-testing penalty
  if (deflatedSharpe.isSignificant && rawEstimatedSharpe > 1.5) {
    return {
      anomaly: plan.anomaly,
      estimatedSharpe: rawEstimatedSharpe,
      deflatedSharpe,
      targetPhase: 'PAPER', // Promoted to paper candidate
      isPromotedToPaper: true,
    };
  }

  return {
    anomaly: plan.anomaly,
    estimatedSharpe: rawEstimatedSharpe,
    deflatedSharpe,
    targetPhase: 'KILLED',
    isPromotedToPaper: false,
  };
}

export function getAutomatedCeilingPhase(): string {
  return AUTOMATED_CEILING;
}
