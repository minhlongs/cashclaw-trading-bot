import type { LlmProviderInput, ProviderRegistry } from './provider-adapter';
import type { AgentRole, DeliberationTask } from '@/tree/research/tradingagents';
import { tierForTask, recordModelProvenance } from '@/tree/research/tradingagents/model-provenance';
import type { RoutedCallOutcome } from './model-router';
import { attemptProviderCall } from './model-router-attempt';
import { executeFallbackCall } from './model-router-fallback';

export async function executeRouteCall(
  agentRole: AgentRole, task: DeliberationTask, cappedInput: LlmProviderInput,
  registry: ProviderRegistry, defaultTimeoutMs: number,
): Promise<{ ok: true; value: RoutedCallOutcome } | { ok: false; reasons: readonly string[] }> {
  const tier = tierForTask(task);
  const primary = registry.getPrimaryForTier(tier);
  if (!primary) return { ok: false, reasons: [`model-router: no configured primary provider for tier '${tier}'`] };
  const fallback = registry.getFallbackForTier(tier);
  try {
    const res = await attemptProviderCall(primary, cappedInput, defaultTimeoutMs);
    const rec = recordModelProvenance(agentRole, task, {
      providerId: primary.providerId, modelId: primary.models[tier],
      tier, promptTokens: res.promptTokens, completionTokens: res.completionTokens, latencyMs: res.latencyMs,
    });
    if (!rec.ok) return { ok: false, reasons: rec.reasons };
    return { ok: true, value: { text: res.text, provenance: rec.record, fallbackUsed: false } };
  } catch (err) {
    if (!fallback) return { ok: false, reasons: [`model-router: primary failed and no fallback: ${(err as Error).message}`] };
    return executeFallbackCall(fallback, agentRole, task, tier, cappedInput, defaultTimeoutMs, err as Error);
  }
}
