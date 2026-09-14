// Debate Orchestrator Prompts — system prompts and template builders.

import type { AgentRole, DeliberationTask } from '@/tree/research/tradingagents';

export type DebatePromptType = 'bull' | 'bear';
export type RiskViewType = 'aggressive' | 'neutral' | 'conservative';

export const ANALYST_ROLES: readonly AgentRole[] = ['analyst', 'analyst', 'analyst', 'analyst'];
export const ANALYST_TASKS: readonly DeliberationTask[] = [
  'data-extraction',
  'summarization',
  'data-extraction',
  'summarization',
];
export const ANALYST_PROMPTS: readonly string[] = [
  'Extract fundamental metrics for the research goal.',
  'Summarize sentiment signals for the research goal.',
  'Extract news catalysts for the research goal.',
  'Summarize technical indicators for the research goal.',
];

export const ANALYST_SYSTEM_PROMPT =
  'You are a financial analyst. Output JSON with {claim: string, evidence: string[]}.';
export const BULL_SYSTEM_PROMPT =
  'You are a bull researcher. Produce a structured falsifiable thesis.';
export const BEAR_SYSTEM_PROMPT =
  'You are a bear researcher. Produce a structured falsifiable thesis.';
export const SYNTHESIS_SYSTEM_PROMPT =
  'You are a research manager. Synthesize debate into falsifiable research statement. NO approval fields.';
export const RISK_SYSTEM_PROMPT =
  'You are a risk advisor. Advisory only - no sizing fields.';
export const PORTFOLIO_SYSTEM_PROMPT =
  'You are a portfolio advisor. Advisory only - CashClaw engine decides actual sizing.';

export const RISK_VIEWS: readonly RiskViewType[] = ['aggressive', 'neutral', 'conservative'];

/** Format standard round prompt for bull or bear researcher. */
export function formatDebatePrompt(
  side: DebatePromptType,
  round: number,
  previousOpponentThesis: string,
): string {
  const isBull = side === 'bull';
  const label = isBull ? 'BULL' : 'BEAR';
  const oppLabel = isBull ? 'bear' : 'bull';
  const prev = previousOpponentThesis || 'none';
  return `Round ${round}: Argue the ${label} case. Previous ${oppLabel}: ${prev}. Output JSON with {thesis: string, evidence: string[], mechanism: string, expectedDirection: 'long'|'short'|'neutral', horizon: number, features: string[]}.`;
}

/** Build synthesis prompt for research manager. */
export function buildSynthesisPrompt(bullThesis: string, bearThesis: string): string {
  return `Synthesize the bull/bear debate. Bull: ${bullThesis}. Bear: ${bearThesis}. Output JSON with {thesis: string, strongestEvidence: string, strongestCounterEvidence: string, unresolvedUncertainty: string, falsifiableAssumptions: [{statement: string, howToFalsify: string}], proposedExperiments: [{hypothesisRef: string, method: string}]}.`;
}

/** Build risk view prompt for risk advisor. */
export function buildRiskPrompt(view: RiskViewType, synthesisText: string): string {
  return `Provide ${view} risk view. Synthesis: ${synthesisText}. Output JSON with {expectedRegime: string, keyRisks: string[], failureConditions: string[], maxAcceptableExposure: number, liquidityConcern: string, volatilityConcern: string, correlationConcern: string}.`;
}

/** Build portfolio proposal prompt for portfolio advisor. */
export function buildPortfolioPrompt(synthesisText: string, riskScenarios: readonly string[]): string {
  return `Propose portfolio. Synthesis: ${synthesisText}. Risk views: ${riskScenarios.join('; ')}. Output JSON with {assets: string[], weights: number[], hedge: string, rebalance: string, exposure: number}.`;
}
