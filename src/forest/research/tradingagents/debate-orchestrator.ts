// Debate Orchestrator — runs bull/bear rounds → research synthesis → risk
// debate → portfolio proposal. Uses injected LlmProvider via ModelRouter.
// Returns DecisionProposal + DebateState. Pure orchestration, no I/O logic.

import type { ModelRouter, RoutedCallOutcome } from './model-router';
import type { AgentRole, DeliberationTask, ModelProvenanceRecord, ToolProvenance } from '@/tree/research/tradingagents';
import type { DecisionProposal } from '@/tree/research/tradingagents/decision-contract';
import type { DebateState, DebateRound } from '@/tree/research/tradingagents/debate-state';
import { sanitizeUntrusted } from '@/tree/research/tradingagents/security-gate';
import { composeDecisionProposal } from './decision-proposal-composer';

/** Configuration for the debate orchestrator. */
export interface DebateOrchestratorConfig {
  readonly router: ModelRouter;
  readonly maxDebateRounds: number;
  readonly researchGoalId: string;
  readonly proposalId: string;
  readonly nowIso: string;
}

/** Structured bull/bear side parsed from the LLM JSON response. */
export interface DebateSide {
  readonly role: 'bull-researcher' | 'bear-researcher';
  readonly thesis: string;
  readonly mechanism: string;
  readonly evidence: readonly string[];
  readonly expectedDirection: 'long' | 'short' | 'neutral';
  readonly horizon: number;
  readonly features: readonly string[];
}

/** Full orchestrator output. */
export interface OrchestratorResult {
  readonly decisionProposal: DecisionProposal;
  readonly debateState: DebateState;
  readonly bull: DebateSide;
  readonly bear: DebateSide;
  readonly modelProvenance: readonly ModelProvenanceRecord[];
  readonly toolProvenance: readonly ToolProvenance[];
}

/**
 * Parse the LLM JSON response into a structured DebateSide.
 * Fail-closed: returns null if the JSON is missing required fields.
 */
function parseDebateSide(role: 'bull-researcher' | 'bear-researcher', text: string): DebateSide | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.thesis !== 'string' || typeof o.mechanism !== 'string') return null;
  if (!Array.isArray(o.evidence) || !o.evidence.every((e) => typeof e === 'string')) return null;
  if (typeof o.horizon !== 'number' || !Number.isFinite(o.horizon)) return null;
  if (!Array.isArray(o.features) || !o.features.every((f) => typeof f === 'string')) return null;
  const dir = o.expectedDirection;
  if (dir !== 'long' && dir !== 'short' && dir !== 'neutral') return null;
  return {
    role,
    thesis: o.thesis,
    mechanism: o.mechanism,
    evidence: o.evidence as string[],
    expectedDirection: dir,
    horizon: o.horizon,
    features: o.features as string[],
  };
}

/** Build a DebateRound entry. */
function makeRound(agentRole: AgentRole, agentId: string, content: string, round: number): DebateRound {
  return { agentRole, agentId, content, round };
}

/** Call the router for a specific agent role and task. */
async function callAgent(
  router: ModelRouter,
  agentRole: AgentRole,
  task: DeliberationTask,
  prompt: string,
  systemPrompt: string,
): Promise<{ ok: true; value: RoutedCallOutcome } | { ok: false; reasons: readonly string[] }> {
  const sanitized = sanitizeUntrusted(prompt);
  if (!sanitized.ok) {
    return { ok: false, reasons: [sanitized.reason] };
  }
  return router.route(agentRole, task, {
    prompt: sanitized.cleaned,
    systemPrompt,
    temperature: 0.3,
    maxTokens: 2048,
    responseFormat: 'json',
  });
}

/**
 * Run the full deliberation pipeline:
 * 1. Analyst team (4 roles) → data extraction/summarization (FAST)
 * 2. Bull/Bear debate (maxDebateRounds rounds) → debate (REASONING)
 * 3. Research Manager synthesis → research-synthesis (REASONING)
 * 4. Risk debate (3 views) → repetitive-research (LOCAL)
 * 5. Portfolio proposal → repetitive-research (LOCAL)
 * 6. Compose DecisionProposal
 */
export async function runDebateOrchestrator(
  config: DebateOrchestratorConfig,
): Promise<{ ok: true; value: OrchestratorResult } | { ok: false; reasons: readonly string[] }> {
  const reasons: string[] = [];
  const modelProvenance: ModelProvenanceRecord[] = [];
  const toolProvenance: ToolProvenance[] = [];
  const rounds: DebateRound[] = [];
  let round = 0;

  // Phase 1: Analyst team (FAST tier)
  const analystRoles: AgentRole[] = ['analyst', 'analyst', 'analyst', 'analyst'];
  const analystTasks: DeliberationTask[] = ['data-extraction', 'summarization', 'data-extraction', 'summarization'];
  const analystPrompts = [
    'Extract fundamental metrics for the research goal.',
    'Summarize sentiment signals for the research goal.',
    'Extract news catalysts for the research goal.',
    'Summarize technical indicators for the research goal.',
  ];
  const analystSystemPrompt = 'You are a financial analyst. Output JSON with {claim: string, evidence: string[]}.';

  for (let i = 0; i < analystRoles.length; i++) {
    const result = await callAgent(config.router, analystRoles[i], analystTasks[i], analystPrompts[i], analystSystemPrompt);
    if (!result.ok) {
      reasons.push(...result.reasons);
      continue;
    }
    modelProvenance.push(result.value.provenance);
    rounds.push(makeRound(analystRoles[i], `${analystRoles[i]}-${i}`, result.value.text, round));
  }
  round += 1;

  // Phase 2: Bull/Bear debate (REASONING tier)
  let bullThesis = '';
  let bearThesis = '';
  let bullSide: DebateSide | null = null;
  let bearSide: DebateSide | null = null;

  for (let r = 0; r < config.maxDebateRounds; r++) {
    // Bull researcher
    const bullPrompt = `Round ${r + 1}: Argue the BULL case. Previous bear: ${bearThesis || 'none'}. Output JSON with {thesis: string, evidence: string[], mechanism: string, expectedDirection: 'long'|'short'|'neutral', horizon: number, features: string[]}.`;
    const bullResult = await callAgent(config.router, 'bull-researcher', 'debate', bullPrompt, 'You are a bull researcher. Produce a structured falsifiable thesis.');
    if (!bullResult.ok) {
      reasons.push(...bullResult.reasons);
    } else {
      modelProvenance.push(bullResult.value.provenance);
      bullThesis = bullResult.value.text;
      bullSide = parseDebateSide('bull-researcher', bullResult.value.text);
      rounds.push(makeRound('bull-researcher', `bull-${r}`, bullResult.value.text, round));
    }

    // Bear researcher
    const bearPrompt = `Round ${r + 1}: Argue the BEAR case. Previous bull: ${bullThesis || 'none'}. Output JSON with {thesis: string, evidence: string[], mechanism: string, expectedDirection: 'long'|'short'|'neutral', horizon: number, features: string[]}.`;
    const bearResult = await callAgent(config.router, 'bear-researcher', 'debate', bearPrompt, 'You are a bear researcher. Produce a structured falsifiable thesis.');
    if (!bearResult.ok) {
      reasons.push(...bearResult.reasons);
    } else {
      modelProvenance.push(bearResult.value.provenance);
      bearThesis = bearResult.value.text;
      bearSide = parseDebateSide('bear-researcher', bearResult.value.text);
      rounds.push(makeRound('bear-researcher', `bear-${r}`, bearResult.value.text, round));
    }
    round += 1;
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  if (!bullSide || !bearSide) {
    return { ok: false, reasons: ['debate: bull/bear JSON response missing required structured fields'] };
  }

  // Phase 3: Research Manager synthesis (REASONING tier)
  const synthesisPrompt = `Synthesize the bull/bear debate. Bull: ${bullThesis}. Bear: ${bearThesis}. Output JSON with {thesis: string, strongestEvidence: string, strongestCounterEvidence: string, unresolvedUncertainty: string, falsifiableAssumptions: [{statement: string, howToFalsify: string}], proposedExperiments: [{hypothesisRef: string, method: string}]}.`;
  const synthesisResult = await callAgent(config.router, 'research-manager', 'research-synthesis', synthesisPrompt, 'You are a research manager. Synthesize debate into falsifiable research statement. NO approval fields.');
  if (!synthesisResult.ok) {
    return { ok: false, reasons: synthesisResult.reasons };
  }
  modelProvenance.push(synthesisResult.value.provenance);
  rounds.push(makeRound('research-manager', 'synthesis', synthesisResult.value.text, round));
  round += 1;

  // Phase 4: Risk debate (LOCAL tier)
  const riskViews: Array<'aggressive' | 'neutral' | 'conservative'> = ['aggressive', 'neutral', 'conservative'];
  const riskScenarios: string[] = [];

  for (const view of riskViews) {
    const riskPrompt = `Provide ${view} risk view. Synthesis: ${synthesisResult.value.text}. Output JSON with {expectedRegime: string, keyRisks: string[], failureConditions: string[], maxAcceptableExposure: number, liquidityConcern: string, volatilityConcern: string, correlationConcern: string}.`;
    const riskResult = await callAgent(config.router, 'risk-advisor', 'repetitive-research', riskPrompt, 'You are a risk advisor. Advisory only - no sizing fields.');
    if (!riskResult.ok) {
      reasons.push(...riskResult.reasons);
    } else {
      modelProvenance.push(riskResult.value.provenance);
      riskScenarios.push(riskResult.value.text);
      rounds.push(makeRound('risk-advisor', `risk-${view}`, riskResult.value.text, round));
    }
  }
  round += 1;

  // Phase 5: Portfolio proposal (LOCAL tier)
  const portfolioPrompt = `Propose portfolio. Synthesis: ${synthesisResult.value.text}. Risk views: ${riskScenarios.join('; ')}. Output JSON with {assets: string[], weights: number[], hedge: string, rebalance: string, exposure: number}.`;
  const portfolioResult = await callAgent(config.router, 'portfolio-advisor', 'repetitive-research', portfolioPrompt, 'You are a portfolio advisor. Advisory only - CashClaw engine decides actual sizing.');
  if (!portfolioResult.ok) {
    return { ok: false, reasons: portfolioResult.reasons };
  }
  modelProvenance.push(portfolioResult.value.provenance);
  rounds.push(makeRound('portfolio-advisor', 'portfolio', portfolioResult.value.text, round));

  // Phase 6: Compose DecisionProposal
  const decisionProposal = composeDecisionProposal(
    config,
    bullThesis,
    bearThesis,
    synthesisResult.value.text,
    riskScenarios,
    portfolioResult.value.text,
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
      bull: bullSide,
      bear: bearSide,
      modelProvenance,
      toolProvenance,
    },
  };
}