import type { LlmProvider, LlmProviderInput, LlmProviderResult } from './provider-adapter';
import type { ModelTier, SupportedProvider } from '@/tree/research/tradingagents';
import { CANNED_RESPONSES, detectRole } from './test-fixtures-canned';

const TIERS: Readonly<Record<ModelTier, string>> = { FAST: 'fixture-fast', REASONING: 'fixture-reasoning', LOCAL: 'fixture-local' };
const FAILING_TIERS: Readonly<Record<ModelTier, string>> = { FAST: 'failing-fast', REASONING: 'failing-reasoning', LOCAL: 'failing-local' };

export class DeterministicFixtureProvider implements LlmProvider {
  readonly providerId: SupportedProvider = 'Anthropic';
  readonly displayName = 'Deterministic Fixture Provider (TEST)';
  readonly models = TIERS;
  readonly isConfigured = true;
  async call(input: LlmProviderInput): Promise<LlmProviderResult> {
    const role = detectRole(input.systemPrompt);
    return { text: CANNED_RESPONSES[role] ?? CANNED_RESPONSES.analyst!, usage: { promptTokens: 100, completionTokens: 50 }, latencyMs: 10 };
  }
}

export class FailingProvider implements LlmProvider {
  readonly providerId: SupportedProvider = 'Anthropic';
  readonly displayName = 'Failing Provider (TEST)';
  readonly models = FAILING_TIERS;
  readonly isConfigured = true;
  async call(): Promise<LlmProviderResult> { throw new Error('provider intentionally failed'); }
}

export function makeFixtureProvider(providerId: SupportedProvider): LlmProvider {
  return {
    providerId, displayName: `Fixture ${providerId} (TEST)`, models: TIERS, isConfigured: true,
    async call(input: LlmProviderInput): Promise<LlmProviderResult> {
      const role = detectRole(input.systemPrompt);
      return { text: CANNED_RESPONSES[role] ?? CANNED_RESPONSES.analyst!, usage: { promptTokens: 100, completionTokens: 50 }, latencyMs: 10 };
    },
  };
}

export function makeFailingFixtureProvider(providerId: SupportedProvider): LlmProvider {
  return {
    providerId, displayName: `Failing ${providerId} (TEST)`, models: FAILING_TIERS, isConfigured: true,
    async call(): Promise<LlmProviderResult> { throw new Error('provider intentionally failed'); },
  };
}
