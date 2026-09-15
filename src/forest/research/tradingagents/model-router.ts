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
  AgentRole,
  DeliberationTask,
  ModelTier,
  ModelProvenanceRecord,
} from '@/tree/research/tradingagents';
import { executeRouteCall } from './model-router-execute';

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
    const cappedInput: LlmProviderInput = {
      ...input,
      maxTokens: Math.min(input.maxTokens ?? this.config.maxTokensCap, this.config.maxTokensCap),
      temperature: input.temperature ?? 0.3,
    };

    return executeRouteCall(
      agentRole,
      task,
      cappedInput,
      this.config.registry,
      this.config.defaultTimeoutMs,
    );
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
