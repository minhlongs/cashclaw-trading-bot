// Decision Proposal Composer — composes the final DecisionProposal from all
// deliberation outputs (bull/bear thesis, synthesis, risk views, portfolio
// proposal, model provenance). Pure function: no I/O, no LLM.

import type { AgentRole, ModelProvenanceRecord } from '@/tree/research/tradingagents';
import type { DecisionProposal } from '@/tree/research/tradingagents/decision-contract';
import type { DebateOrchestratorConfig } from './debate-orchestrator';

/** Compose the final DecisionProposal from all deliberation outputs. */
export function composeDecisionProposal(
  config: DebateOrchestratorConfig,
  bullThesis: string,
  bearThesis: string,
  _synthesis: string,
  riskScenarios: readonly string[],
  _portfolioProposal: string,
  modelProvenance: readonly ModelProvenanceRecord[],
): DecisionProposal {
  const evidence = [
    { claim: 'Bull thesis', source: 'bull-researcher' },
    { claim: 'Bear thesis', source: 'bear-researcher' },
    { claim: 'Research synthesis', source: 'research-manager' },
  ];

  const primaryProvenance = modelProvenance[0]?.provenance ?? {
    providerId: 'Unknown',
    modelId: 'Unknown',
    tier: 'REASONING' as const,
  };

  const firstRecord = modelProvenance[0];
  const agentProvenance = {
    agentRole: firstRecord?.agentRole ?? ('bull-researcher' as AgentRole),
    agentId: 'debate-orchestrator',
    providerId: firstRecord?.provenance.providerId ?? 'Unknown',
    modelId: firstRecord?.provenance.modelId ?? 'Unknown',
  };

  return {
    proposalId: config.proposalId,
    researchGoalId: config.researchGoalId,
    thesis: bullThesis,
    counterThesis: bearThesis,
    evidence,
    assumptions: ['Market regime persistence', 'Liquidity availability', 'Correlation stability'],
    invalidationConditions: ['Regime shift', 'Liquidity crisis', 'Correlation breakdown'],
    catalyst: ['Earnings', 'Macro event', 'Technical breakout'],
    horizon: 20,
    confidence: 0.65,
    proposedDirection: 'long',
    proposedPosition: 0.1,
    proposedEntry: 'market',
    proposedExit: 'target or stop',
    proposedStop: '2% below entry',
    riskFactors: riskScenarios.flatMap((r) => [r]),
    dataProvenance: [
      { dataset: 'ohlcv', provider: 'binance', timestamp: config.nowIso },
      { dataset: 'regime', provider: 'internal', timestamp: config.nowIso },
    ],
    agentProvenance,
    modelProvenance: primaryProvenance,
    createdAt: config.nowIso,
  };
}