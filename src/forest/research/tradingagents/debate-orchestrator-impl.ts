// Debate Orchestrator Implementation — 6-phase deliberation engine.
// Executes analyst extraction, bull/bear debate, synthesis, risk, and portfolio.

import type { DebateOrchestratorConfig, OrchestratorResult } from './debate-orchestrator-types';
import type { ModelProvenanceRecord, ToolProvenance } from '@/tree/research/tradingagents';
import type { DebateRound, DebateState } from '@/tree/research/tradingagents/debate-state';
import { runAnalystPhase } from './debate-analyst';
import { runDebateRounds } from './debate-rounds';
import { runSynthesisRiskPortfolio } from './debate-synth-risk-portfolio';
import { composeDecisionProposal } from './decision-proposal-composer';

export async function runDebateOrchestrator(
  config: DebateOrchestratorConfig,
): Promise<{ ok: true; value: OrchestratorResult } | { ok: false; reasons: readonly string[] }> {
  const reasons: string[] = [];
  const modelProvenance: ModelProvenanceRecord[] = [];
  const toolProvenance: ToolProvenance[] = [];
  const rounds: DebateRound[] = [];

  let round = await runAnalystPhase(config.router, rounds, modelProvenance, reasons, 0);

  const debateRes = await runDebateRounds(
    config.router,
    config.maxDebateRounds,
    rounds,
    modelProvenance,
    reasons,
    round,
  );
  round = debateRes.round;

  if (reasons.length > 0) return { ok: false, reasons };
  if (!debateRes.bullSide || !debateRes.bearSide) {
    return { ok: false, reasons: ['debate: bull/bear JSON response missing required structured fields'] };
  }

  const srpRes = await runSynthesisRiskPortfolio(
    config.router,
    debateRes.bullThesis,
    debateRes.bearThesis,
    rounds,
    modelProvenance,
    reasons,
    round,
  );
  if (!srpRes.ok) return { ok: false, reasons: srpRes.reasons };

  const decisionProposal = composeDecisionProposal(
    config,
    debateRes.bullThesis,
    debateRes.bearThesis,
    srpRes.value.synthText,
    srpRes.value.riskScenarios,
    srpRes.value.portfolioText,
    modelProvenance,
  );

  const debateState: DebateState = {
    researchGoalId: config.researchGoalId,
    proposalId: config.proposalId,
    rounds,
    status: 'complete',
  };

  return {
    ok: true,
    value: {
      decisionProposal,
      debateState,
      bull: debateRes.bullSide,
      bear: debateRes.bearSide,
      modelProvenance,
      toolProvenance,
    },
  };
}
