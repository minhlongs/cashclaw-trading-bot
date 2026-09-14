// Debate Orchestrator Implementation — 6-phase deliberation engine.
// Executes analyst extraction, bull/bear debate, synthesis, risk, and portfolio.

import type { ModelRouter, RoutedCallOutcome } from './model-router';
import type { AgentRole, DeliberationTask, ModelProvenanceRecord, ToolProvenance } from '@/tree/research/tradingagents';
import type { DebateRound, DebateState } from '@/tree/research/tradingagents/debate-state';
import { sanitizeUntrusted } from '@/tree/research/tradingagents/security-gate';
import { composeDecisionProposal } from './decision-proposal-composer';
import { type DebateOrchestratorConfig, type DebateSide, type OrchestratorResult, parseDebateSide } from './debate-orchestrator-types';
import {
  ANALYST_PROMPTS, ANALYST_ROLES, ANALYST_SYSTEM_PROMPT, ANALYST_TASKS,
  BEAR_SYSTEM_PROMPT, BULL_SYSTEM_PROMPT, PORTFOLIO_SYSTEM_PROMPT,
  RISK_SYSTEM_PROMPT, RISK_VIEWS, SYNTHESIS_SYSTEM_PROMPT,
  buildPortfolioPrompt, buildRiskPrompt, buildSynthesisPrompt, formatDebatePrompt,
} from './debate-orchestrator-prompts';

function makeRound(role: AgentRole, id: string, content: string, round: number): DebateRound {
  return { agentRole: role, agentId: id, content, round };
}

async function callAgent(
  router: ModelRouter,
  role: AgentRole,
  task: DeliberationTask,
  prompt: string,
  systemPrompt: string,
): Promise<{ ok: true; value: RoutedCallOutcome } | { ok: false; reasons: readonly string[] }> {
  const sanitized = sanitizeUntrusted(prompt);
  if (!sanitized.ok) return { ok: false, reasons: [sanitized.reason] };
  return router.route(role, task, {
    prompt: sanitized.cleaned,
    systemPrompt,
    temperature: 0.3,
    maxTokens: 2048,
    responseFormat: 'json',
  });
}

export async function runDebateOrchestrator(
  config: DebateOrchestratorConfig,
): Promise<{ ok: true; value: OrchestratorResult } | { ok: false; reasons: readonly string[] }> {
  const reasons: string[] = [];
  const modelProvenance: ModelProvenanceRecord[] = [];
  const toolProvenance: ToolProvenance[] = [];
  const rounds: DebateRound[] = [];
  let round = 0;

  for (let i = 0; i < ANALYST_ROLES.length; i++) {
    const res = await callAgent(config.router, ANALYST_ROLES[i], ANALYST_TASKS[i], ANALYST_PROMPTS[i], ANALYST_SYSTEM_PROMPT);
    if (!res.ok) {
      reasons.push(...res.reasons);
      continue;
    }
    modelProvenance.push(res.value.provenance);
    rounds.push(makeRound(ANALYST_ROLES[i], `${ANALYST_ROLES[i]}-${i}`, res.value.text, round));
  }
  round += 1;

  let bullThesis = '';
  let bearThesis = '';
  let bullSide: DebateSide | null = null;
  let bearSide: DebateSide | null = null;

  for (let r = 0; r < config.maxDebateRounds; r++) {
    const bullPrompt = formatDebatePrompt('bull', r + 1, bearThesis);
    const bullRes = await callAgent(config.router, 'bull-researcher', 'debate', bullPrompt, BULL_SYSTEM_PROMPT);
    if (!bullRes.ok) {
      reasons.push(...bullRes.reasons);
    } else {
      modelProvenance.push(bullRes.value.provenance);
      bullThesis = bullRes.value.text;
      bullSide = parseDebateSide('bull-researcher', bullRes.value.text);
      rounds.push(makeRound('bull-researcher', `bull-${r}`, bullRes.value.text, round));
    }

    const bearPrompt = formatDebatePrompt('bear', r + 1, bullThesis);
    const bearRes = await callAgent(config.router, 'bear-researcher', 'debate', bearPrompt, BEAR_SYSTEM_PROMPT);
    if (!bearRes.ok) {
      reasons.push(...bearRes.reasons);
    } else {
      modelProvenance.push(bearRes.value.provenance);
      bearThesis = bearRes.value.text;
      bearSide = parseDebateSide('bear-researcher', bearRes.value.text);
      rounds.push(makeRound('bear-researcher', `bear-${r}`, bearRes.value.text, round));
    }
    round += 1;
  }

  if (reasons.length > 0) return { ok: false, reasons };
  if (!bullSide || !bearSide) {
    return { ok: false, reasons: ['debate: bull/bear JSON response missing required structured fields'] };
  }

  const synthPrompt = buildSynthesisPrompt(bullThesis, bearThesis);
  const synthRes = await callAgent(config.router, 'research-manager', 'research-synthesis', synthPrompt, SYNTHESIS_SYSTEM_PROMPT);
  if (!synthRes.ok) return { ok: false, reasons: synthRes.reasons };
  modelProvenance.push(synthRes.value.provenance);
  rounds.push(makeRound('research-manager', 'synthesis', synthRes.value.text, round));
  round += 1;

  const riskScenarios: string[] = [];
  for (const view of RISK_VIEWS) {
    const riskPrompt = buildRiskPrompt(view, synthRes.value.text);
    const riskRes = await callAgent(config.router, 'risk-advisor', 'repetitive-research', riskPrompt, RISK_SYSTEM_PROMPT);
    if (!riskRes.ok) {
      reasons.push(...riskRes.reasons);
    } else {
      modelProvenance.push(riskRes.value.provenance);
      riskScenarios.push(riskRes.value.text);
      rounds.push(makeRound('risk-advisor', `risk-${view}`, riskRes.value.text, round));
    }
  }
  round += 1;

  const portPrompt = buildPortfolioPrompt(synthRes.value.text, riskScenarios);
  const portRes = await callAgent(config.router, 'portfolio-advisor', 'repetitive-research', portPrompt, PORTFOLIO_SYSTEM_PROMPT);
  if (!portRes.ok) return { ok: false, reasons: portRes.reasons };
  modelProvenance.push(portRes.value.provenance);
  rounds.push(makeRound('portfolio-advisor', 'portfolio', portRes.value.text, round));

  const decisionProposal = composeDecisionProposal(
    config, bullThesis, bearThesis, synthRes.value.text, riskScenarios, portRes.value.text, modelProvenance,
  );

  const debateState: DebateState = {
    researchGoalId: config.researchGoalId,
    proposalId: config.proposalId,
    rounds,
    status: 'complete',
  };

  return {
    ok: true,
    value: { decisionProposal, debateState, bull: bullSide, bear: bearSide, modelProvenance, toolProvenance },
  };
}
