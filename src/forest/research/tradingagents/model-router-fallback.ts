import type { LlmProvider, LlmProviderInput } from './provider-adapter';
import type { AgentRole, DeliberationTask, ModelTier } from '@/tree/research/tradingagents';
import { recordModelProvenance } from '@/tree/research/tradingagents/model-provenance';
import type { RoutedCallOutcome } from './model-router';
import { attemptProviderCall } from './model-router-attempt';

export async function executeFallbackCall(
  fallback: LlmProvider, agentRole: AgentRole, task: DeliberationTask,
  tier: ModelTier, input: LlmProviderInput, timeoutMs: number, primaryError: Error,
): Promise<{ ok: true; value: RoutedCallOutcome } | { ok: false; reasons: readonly string[] }> {
  try {
    const res = await attemptProviderCall(fallback, input, timeoutMs);
    const rec = recordModelProvenance(agentRole, task, {
      providerId: fallback.providerId, modelId: fallback.models[tier],
      tier, promptTokens: res.promptTokens, completionTokens: res.completionTokens, latencyMs: res.latencyMs,
    });
    if (!rec.ok) return { ok: false, reasons: rec.reasons };
    return { ok: true, value: { text: res.text, provenance: rec.record, fallbackUsed: true } };
  } catch (err) {
    const msg = (err as Error).message;
    return { ok: false, reasons: [`model-router: primary failed: ${primaryError.message}; fallback failed: ${msg}`] };
  }
}
