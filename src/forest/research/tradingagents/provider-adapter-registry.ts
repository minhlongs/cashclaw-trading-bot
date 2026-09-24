// Provider Adapter — registry factory with validation.

import type { AgentRole, DeliberationTask, ModelTier, SupportedProvider } from '@/tree/research/tradingagents';
import type { LlmProvider, ProviderRegistry } from './provider-adapter-types';

const SUPPORTED_PROVIDERS: readonly SupportedProvider[] = [
  'Anthropic',
  'OpenAI',
  'Gemini',
  'DeepSeek',
  'Qwen',
  'GLM',
  'MiniMax',
  'OpenRouter',
  'Ollama/local',
];

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
    if (!SUPPORTED_PROVIDERS.includes(p.providerId)) {
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
