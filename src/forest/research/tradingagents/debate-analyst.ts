// Analyst debate phase — ANALYST_ROLES loop.

import type { ModelRouter } from './model-router';
import type { ModelProvenanceRecord } from '@/tree/research/tradingagents';
import type { DebateRound } from '@/tree/research/tradingagents/debate-state';
import { makeRound, callAgent } from './debate-call-agent';
import {
  ANALYST_PROMPTS,
  ANALYST_ROLES,
  ANALYST_SYSTEM_PROMPT,
  ANALYST_TASKS,
} from './debate-orchestrator-prompts';

export async function runAnalystPhase(
  router: ModelRouter,
  rounds: DebateRound[],
  modelProvenance: ModelProvenanceRecord[],
  reasons: string[],
  round: number,
): Promise<number> {
  for (let i = 0; i < ANALYST_ROLES.length; i++) {
    const res = await callAgent(router, ANALYST_ROLES[i], ANALYST_TASKS[i], ANALYST_PROMPTS[i], ANALYST_SYSTEM_PROMPT);
    if (!res.ok) {
      reasons.push(...res.reasons);
      continue;
    }
    modelProvenance.push(res.value.provenance);
    rounds.push(makeRound(ANALYST_ROLES[i], `${ANALYST_ROLES[i]}-${i}`, res.value.text, round));
  }
  return round + 1;
}
