// Model Router — OmniRouter-compatible tiered routing (FAST/REASONING/LOCAL).
// Records provenance for every call. Missing key/config → typed failure
// (never silent fallback). Built on ProviderChain provenance pattern.

import {
  type LlmProvider, type ProviderRegistry, type LlmProviderInput, createProviderRegistry,
} from './provider-adapter';
import type {
  AgentRole, DeliberationTask, ModelTier, ModelProvenanceRecord,
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

export class ModelRouter {
  private readonly config: ModelRouterConfig;
  constructor(config: ModelRouterConfig) { this.config = config; }

  async route(
    agentRole: AgentRole, task: DeliberationTask, input: LlmProviderInput,
  ): Promise<{ ok: true; value: RoutedCallOutcome } | { ok: false; reasons: readonly string[] }> {
    const cappedInput: LlmProviderInput = {
      ...input,
      maxTokens: Math.min(input.maxTokens ?? this.config.maxTokensCap, this.config.maxTokensCap),
      temperature: input.temperature ?? 0.3,
    };
    return executeRouteCall(agentRole, task, cappedInput, this.config.registry, this.config.defaultTimeoutMs);
  }

  getSelectedProvider(tier: ModelTier): { primary: LlmProvider | null; fallback: LlmProvider | null } {
    return {
      primary: this.config.registry.getPrimaryForTier(tier),
      fallback: this.config.registry.getFallbackForTier(tier),
    };
  }
}

export function createModelRouter(
  providers: readonly LlmProvider[],
  options: { defaultTimeoutMs?: number; maxTokensCap?: number } = {},
): { ok: true; router: ModelRouter } | { ok: false; reasons: readonly string[] } {
  const registryResult = createProviderRegistry(providers);
  if (!registryResult.ok) return registryResult;
  return {
    ok: true,
    router: new ModelRouter({
      registry: registryResult.registry,
      defaultTimeoutMs: options.defaultTimeoutMs ?? 30000,
      maxTokensCap: options.maxTokensCap ?? 4096,
    }),
  };
}
