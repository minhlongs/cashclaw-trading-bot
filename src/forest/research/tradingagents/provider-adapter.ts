// LLM Provider Adapter — interface + allowlisted provider registry.
// Pure forest-side: I/O via DI only. No hardcoded keys. All providers are
// injected at runtime; missing config → typed failure (never silent fallback).
// Returns {text, usage: {promptTokens, completionTokens}, latencyMs} per call.

export type {
  LlmProviderResult,
  LlmProviderInput,
  LlmProvider,
  ProviderRegistry,
  RoutedCallResult,
} from './provider-adapter-types';

export {
  NoProviderAvailableError,
  ProviderCallFailedError,
  createProviderRegistry,
} from './provider-adapter-registry';
