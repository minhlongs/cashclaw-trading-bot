// LLM Provider Adapter — interface + allowlisted provider registry.
// Pure forest-side: I/O via DI only. No hardcoded keys. All providers are
// injected at runtime; missing config → typed failure (never silent fallback).
// Returns {text, usage: {promptTokens, completionTokens}, latencyMs} per call.

import type { ModelProvenance, ModelTier, SupportedProvider, AgentRole, DeliberationTask } from '@/tree/research/tradingagents';

/** Result of a single provider call. */
export interface LlmProviderResult {
  readonly text: string;
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
  };
  readonly latencyMs: number;
}

/** Provider call input. */
export interface LlmProviderInput {
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly responseFormat?: 'text' | 'json';
}

/** Interface every LLM provider must implement. */
export interface LlmProvider {
  /** Unique provider id (must match SUPPORTED_PROVIDERS allowlist). */
  readonly providerId: SupportedProvider;
  /** Display name for logging. */
  readonly displayName: string;
  /** Models this provider offers, keyed by tier. */
  readonly models: Readonly<Record<ModelTier, string>>;
  /** Whether the provider is configured (has keys). */
  readonly isConfigured: boolean;
  /** Call the provider. Throws on provider-level errors. */
  call(input: LlmProviderInput): Promise<LlmProviderResult>;
}

/** Provider registry — holds instantiated providers keyed by id. */
export interface ProviderRegistry {
  readonly providers: ReadonlyMap<SupportedProvider, LlmProvider>;
  /** Get a provider by id. Returns null if not registered or not configured. */
  get(providerId: SupportedProvider): LlmProvider | null;
  /** Get the primary provider for a tier (first registered, configured). */
  getPrimaryForTier(tier: ModelTier): LlmProvider | null;
  /** Get the fallback provider for a tier (second registered, configured). */
  getFallbackForTier(tier: ModelTier): LlmProvider | null;
}

/** Result of a routed provider call with full provenance. */
export interface RoutedCallResult {
  readonly result: LlmProviderResult;
  readonly provenance: ModelProvenance;
  readonly fallbackUsed: boolean;
}

/** Error when no provider is available for a tier. */
export class NoProviderAvailableError extends Error {
  readonly tier: ModelTier;
  readonly task: DeliberationTask;
  readonly agentRole: AgentRole;
  constructor(tier: ModelTier, task: DeliberationTask, agentRole: AgentRole) {
    super(`No configured provider available for tier '${tier}' (task: ${task}, role: ${agentRole})`);
    this.name = 'NoProviderAvailableError';
    this.tier = tier;
    this.task = task;
    this.agentRole = agentRole;
  }
}

/** Error when a provider call fails and no fallback exists. */
export class ProviderCallFailedError extends Error {
  readonly providerId: SupportedProvider;
  readonly originalError: Error;
  constructor(providerId: SupportedProvider, originalError: Error) {
    super(`Provider '${providerId}' failed: ${originalError.message}`);
    this.name = 'ProviderCallFailedError';
    this.providerId = providerId;
    this.originalError = originalError;
  }
}

/**
 * Build a provider registry from an injected array of providers.
 * Validates: no duplicate providerIds, all ids are in SUPPORTED_PROVIDERS.
 */
export function createProviderRegistry(
  providers: readonly LlmProvider[],
): { ok: true; registry: ProviderRegistry } | { ok: false; reasons: readonly string[] } {
  const reasons: string[] = [];
  const seen = new Set<string>();
  const providerMap = new Map<SupportedProvider, LlmProvider>();

  for (const p of providers) {
    if (!['Anthropic', 'OpenAI', 'Gemini', 'DeepSeek', 'Qwen', 'GLM', 'MiniMax', 'OpenRouter', 'Ollama/local'].includes(p.providerId)) {
      reasons.push(`provider-adapter: unknown providerId '${p.providerId}' (not in allowlist)`);
      continue;
    }
    if (seen.has(p.providerId)) {
      reasons.push(`provider-adapter: duplicate providerId '${p.providerId}'`);
      continue;
    }
    seen.add(p.providerId);
    providerMap.set(p.providerId, p);
  }

  if (reasons.length > 0) return { ok: false, reasons };

  return {
    ok: true,
    registry: {
      providers: providerMap,
      get(providerId: SupportedProvider): LlmProvider | null {
        return providerMap.get(providerId) ?? null;
      },
      getPrimaryForTier(tier: ModelTier): LlmProvider | null {
        for (const p of providerMap.values()) {
          if (p.isConfigured && p.models[tier]) return p;
        }
        return null;
      },
      getFallbackForTier(tier: ModelTier): LlmProvider | null {
        let found = false;
        for (const p of providerMap.values()) {
          if (p.isConfigured && p.models[tier]) {
            if (found) return p;
            found = true;
          }
        }
        return null;
      },
    },
  };
}