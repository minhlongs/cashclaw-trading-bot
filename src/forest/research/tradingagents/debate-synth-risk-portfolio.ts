// Synthesis + Risk + Portfolio debate phase.

import type { ModelRouter } from './model-router';
import type { ModelProvenanceRecord } from '@/tree/research/tradingagents';
import type { DebateRound } from '@/tree/research/tradingagents/debate-state';
import { makeRound, callAgent } from './debate-call-agent';
import {
  RISK_VIEWS,
  PORTFOLIO_SYSTEM_PROMPT,
  RISK_SYSTEM_PROMPT,
  SYNTHESIS_SYSTEM_PROMPT,
  buildPortfolioPrompt,
  buildRiskPrompt,
  buildSynthesisPrompt,
} from './debate-orchestrator-prompts';

export interface SynthRiskPortfolioOutput {
  readonly synthText: string;
  readonly riskScenarios: string[];
  readonly portfolioText: string;
  readonly round: number;
}

export async function runSynthesisRiskPortfolio(
  router: ModelRouter,
  bullThesis: string,
  bearThesis: string,
  rounds: DebateRound[],
  modelProvenance: ModelProvenanceRecord[],
  reasons: string[],
  round: number,
): Promise<{ ok: true; value: SynthRiskPortfolioOutput } | { ok: false; reasons: readonly string[] }> {
  const synthPrompt = buildSynthesisPrompt(bullThesis, bearThesis);
  const synthRes = await callAgent(router, 'research-manager', 'research-synthesis', synthPrompt, SYNTHESIS_SYSTEM_PROMPT);
  if (!synthRes.ok) return { ok: false, reasons: synthRes.reasons };
  modelProvenance.push(synthRes.value.provenance);
  rounds.push(makeRound('research-manager', 'synthesis', synthRes.value.text, round));
  const synthText = synthRes.value.text;
  round += 1;

  const riskScenarios: string[] = [];
  for (const view of RISK_VIEWS) {
    const riskPrompt = buildRiskPrompt(view, synthText);
    const riskRes = await callAgent(router, 'risk-advisor', 'repetitive-research', riskPrompt, RISK_SYSTEM_PROMPT);
    if (!riskRes.ok) {
      reasons.push(...riskRes.reasons);
    } else {
      modelProvenance.push(riskRes.value.provenance);
      riskScenarios.push(riskRes.value.text);
      rounds.push(makeRound('risk-advisor', `risk-${view}`, riskRes.value.text, round));
    }
  }
  round += 1;

  const portPrompt = buildPortfolioPrompt(synthText, riskScenarios);
  const portRes = await callAgent(router, 'portfolio-advisor', 'repetitive-research', portPrompt, PORTFOLIO_SYSTEM_PROMPT);
  if (!portRes.ok) return { ok: false, reasons: portRes.reasons };
  modelProvenance.push(portRes.value.provenance);
  rounds.push(makeRound('portfolio-advisor', 'portfolio', portRes.value.text, round));

  return {
    ok: true,
    value: { synthText, riskScenarios, portfolioText: portRes.value.text, round: round + 1 },
  };
}
