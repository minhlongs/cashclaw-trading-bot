// Model Router Execute — extracted routing call execution with fallback & provenance.

import type {
  LlmProviderInput,
  ProviderRegistry,
} from './provider-adapter';
import type {
  ModelProvenance,
  AgentRole,
  DeliberationTask,
} from '@/tree/research/tradingagents';
import { tierForTask, recordModelProvenance } from '@/tree/research/tradingagents/model-provenance';
import type { RoutedCallOutcome } from './model-router';

/**
 * Execute a routed model call with primary provider, timeout racing,
 * fallback on error, and provenance recording.
 */
export async function executeRouteCall(
  agentRole: AgentRole,
  task: DeliberationTask,
  cappedInput: LlmProviderInput,
  registry: ProviderRegistry,
  defaultTimeoutMs: number,
): Promise<{ ok: true; value: RoutedCallOutcome } | { ok: false; reasons: readonly string[] }> {
  // Determine required tier for this task
  const requiredTier = tierForTask(task);

  // Get primary provider for this tier
  const primary = registry.getPrimaryForTier(requiredTier);
  if (!primary) {
    return {
      ok: false,
      reasons: [`model-router: no configured primary provider for tier '${requiredTier}' (task: ${task}, role: ${agentRole})`],
    };
  }

  // Get fallback for this tier
  const fallback = registry.getFallbackForTier(requiredTier);

  // Try primary
  try {
    const startMs = Date.now();
    const result = await Promise.race([
      primary.call(cappedInput),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timeout after ${defaultTimeoutMs}ms`)), defaultTimeoutMs),
      ),
    ]);
    // Prefer provider-reported latency (deterministic for fixtures); fall back to wall-clock.
    const latencyMs = result.latencyMs > 0 ? result.latencyMs : Date.now() - startMs;

    const provenance: ModelProvenance = {
      providerId: primary.providerId,
      modelId: primary.models[requiredTier],
      tier: requiredTier,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      latencyMs,
    };

    const recordResult = recordModelProvenance(agentRole, task, provenance);
    if (!recordResult.ok) {
      return { ok: false, reasons: recordResult.reasons };
    }

    return {
      ok: true,
      value: {
        text: result.text,
        provenance: recordResult.record,
        fallbackUsed: false,
      },
    };
  } catch (primaryError) {
    const primaryErr = primaryError as Error;

    // No fallback → fail
    if (!fallback) {
      return {
        ok: false,
        reasons: [`model-router: primary provider '${primary.providerId}' failed and no fallback available: ${primaryErr.message}`],
      };
    }

    // Try fallback
    try {
      const startMs = Date.now();
      const result = await Promise.race([
        fallback.call(cappedInput),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`timeout after ${defaultTimeoutMs}ms`)), defaultTimeoutMs),
        ),
      ]);
      // Prefer provider-reported latency (deterministic for fixtures); fall back to wall-clock.
      const latencyMs = result.latencyMs > 0 ? result.latencyMs : Date.now() - startMs;

      const provenance: ModelProvenance = {
        providerId: fallback.providerId,
        modelId: fallback.models[requiredTier],
        tier: requiredTier,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        latencyMs,
      };

      const recordResult = recordModelProvenance(agentRole, task, provenance);
      if (!recordResult.ok) {
        return { ok: false, reasons: recordResult.reasons };
      }

      return {
        ok: true,
        value: {
          text: result.text,
          provenance: recordResult.record,
          fallbackUsed: true,
        },
      };
    } catch (fallbackError) {
      const fallbackErr = fallbackError as Error;
      return {
        ok: false,
        reasons: [
          `model-router: primary '${primary.providerId}' failed: ${primaryErr.message}; fallback '${fallback.providerId}' failed: ${fallbackErr.message}`,
        ],
      };
    }
  }
}
