// Provider Adapter — type definitions and interfaces.

import type { ModelProvenance, ModelTier, SupportedProvider } from '@/tree/research/tradingagents';

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
