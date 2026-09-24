// Debate call-agent helpers — makeRound + callAgent (with sanitizeUntrusted + router.route).

import type { ModelRouter, RoutedCallOutcome } from './model-router';
import type { AgentRole, DeliberationTask } from '@/tree/research/tradingagents';
import type { DebateRound } from '@/tree/research/tradingagents/debate-state';
import { sanitizeUntrusted } from '@/tree/research/tradingagents/security-gate';

export function makeRound(role: AgentRole, id: string, content: string, round: number): DebateRound {
  return { agentRole: role, agentId: id, content, round };
}

export async function callAgent(
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
