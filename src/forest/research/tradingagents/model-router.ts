// Model Router — OmniRouter-compatible tiered routing (FAST/REASONING/LOCAL).
// Records provenance for every call. Missing key/config → typed failure
// (never silent fallback). Built on ProviderChain provenance pattern.

import {
  type LlmProvider,
  type ProviderRegistry,
  type LlmProviderInput,
  createProviderRegistry,
} from './provider-adapter';
import type {
  ModelProvenance,
  ModelTier,
  AgentRole,
  DeliberationTask,
  ModelProvenanceRecord,
} from '@/tree/research/tradingagents';
import { tierForTask, recordModelProvenance } from '@/tree/research/tradingagents/model-provenance';

/** Router configuration. */
export interface ModelRouterConfig {
  /** Registry of available providers (injected, no keys in code). */
  readonly registry: ProviderRegistry;
  /** Default timeout per call in ms. */
  readonly defaultTimeoutMs: number;
  /** Maximum tokens per response (hard cap). */
  readonly maxTokensCap: number;
}

/** Outcome of a routed call. */
export interface RoutedCallOutcome {
  readonly text: string;
  readonly provenance: ModelProvenanceRecord;
  readonly fallbackUsed: boolean;
}

/** Error when routing cannot proceed. */
export class RoutingError extends Error {
  readonly task: DeliberationTask;
  readonly agentRole: AgentRole;
  constructor(message: string, task: DeliberationTask, agentRole: AgentRole) {
    super(message);
    this.name = 'RoutingError';
    this.task = task;
    this.agentRole = agentRole;
  }
}

/**
 * Tiered model router. Routes each agent call to the correct tier,
 * selects primary/fallback provider, records full provenance.
 */
export class ModelRouter {
  private readonly config: ModelRouterConfig;

  constructor(config: ModelRouterConfig) {
    this.config = config;
  }

  /**
   * Route a call to the correct tier and provider.
   * Returns text + provenance record. Never silently falls back to wrong tier.
   */
  async route(
    agentRole: AgentRole,
    task: DeliberationTask,
    input: LlmProviderInput,
  ): Promise<{ ok: true; value: RoutedCallOutcome } | { ok: false; reasons: readonly string[] }> {
    // Determine required tier for this task
    const requiredTier = tierForTask(task);

    // Get primary provider for this tier
    const primary = this.config.registry.getPrimaryForTier(requiredTier);
    if (!primary) {
      return {
        ok: false,
        reasons: [`model-router: no configured primary provider for tier '${requiredTier}' (task: ${task}, role: ${agentRole})`],
      };
    }

    // Get fallback for this tier
    const fallback = this.config.registry.getFallbackForTier(requiredTier);

    // Prepare input with caps
    const cappedInput: LlmProviderInput = {
      ...input,
      maxTokens: Math.min(input.maxTokens ?? this.config.maxTokensCap, this.config.maxTokensCap),
      temperature: input.temperature ?? 0.3,
    };

    // Try primary
    try {
      const startMs = Date.now();
      const result = await Promise.race([
        primary.call(cappedInput),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`timeout after ${this.config.defaultTimeoutMs}ms`)), this.config.defaultTimeoutMs),
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
            setTimeout(() => reject(new Error(`timeout after ${this.config.defaultTimeoutMs}ms`)), this.config.defaultTimeoutMs),
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

  /** Get the provider that would be selected for a tier (for testing/inspection). */
  getSelectedProvider(tier: ModelTier): { primary: LlmProvider | null; fallback: LlmProvider | null } {
    return {
      primary: this.config.registry.getPrimaryForTier(tier),
      fallback: this.config.registry.getFallbackForTier(tier),
    };
  }
}

/**
 * Create a ModelRouter from an array of providers.
 * Validates and builds the registry first.
 */
export function createModelRouter(
  providers: readonly LlmProvider[],
  options: { defaultTimeoutMs?: number; maxTokensCap?: number } = {},
): { ok: true; router: ModelRouter } | { ok: false; reasons: readonly string[] } {
  const registryResult = createProviderRegistry(providers);
  if (!registryResult.ok) {
    return registryResult;
  }
  return {
    ok: true,
    router: new ModelRouter({
      registry: registryResult.registry,
      defaultTimeoutMs: options.defaultTimeoutMs ?? 30000,
      maxTokensCap: options.maxTokensCap ?? 4096,
    }),
  };
}