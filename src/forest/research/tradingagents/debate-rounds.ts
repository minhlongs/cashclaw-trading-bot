// Debate rounds — bull/bear loop.

import type { ModelRouter } from './model-router';
import type { ModelProvenanceRecord } from '@/tree/research/tradingagents';
import type { DebateRound } from '@/tree/research/tradingagents/debate-state';
import { makeRound, callAgent } from './debate-call-agent';
import { parseDebateSide, type DebateSide } from './debate-orchestrator-types';
import { formatDebatePrompt, BEAR_SYSTEM_PROMPT, BULL_SYSTEM_PROMPT } from './debate-orchestrator-prompts';

export interface DebateRoundsOutput {
  readonly bullThesis: string;
  readonly bearThesis: string;
  readonly bullSide: DebateSide | null;
  readonly bearSide: DebateSide | null;
  readonly round: number;
}

export async function runDebateRounds(
  router: ModelRouter,
  maxDebateRounds: number,
  rounds: DebateRound[],
  modelProvenance: ModelProvenanceRecord[],
  reasons: string[],
  round: number,
): Promise<DebateRoundsOutput> {
  let bullThesis = '';
  let bearThesis = '';
  let bullSide: DebateSide | null = null;
  let bearSide: DebateSide | null = null;

  for (let r = 0; r < maxDebateRounds; r++) {
    const bullPrompt = formatDebatePrompt('bull', r + 1, bearThesis);
    const bullRes = await callAgent(router, 'bull-researcher', 'debate', bullPrompt, BULL_SYSTEM_PROMPT);
    if (!bullRes.ok) {
      reasons.push(...bullRes.reasons);
    } else {
      modelProvenance.push(bullRes.value.provenance);
      bullThesis = bullRes.value.text;
      bullSide = parseDebateSide('bull-researcher', bullRes.value.text);
      rounds.push(makeRound('bull-researcher', `bull-${r}`, bullRes.value.text, round));
    }

    const bearPrompt = formatDebatePrompt('bear', r + 1, bullThesis);
    const bearRes = await callAgent(router, 'bear-researcher', 'debate', bearPrompt, BEAR_SYSTEM_PROMPT);
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

  return { bullThesis, bearThesis, bullSide, bearSide, round };
}
