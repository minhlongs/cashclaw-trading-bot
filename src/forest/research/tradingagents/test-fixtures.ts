// Test fixtures — DeterministicFixtureProvider for forest-layer tests.
// Returns canned, schema-valid JSON per agent role so the adapter/validation/
// orchestration logic is tested deterministically with zero tokens/keys.
// This is a labeled TEST seam (D11), not real LLM deliberation quality.

import type { LlmProvider, LlmProviderInput, LlmProviderResult } from './provider-adapter';
import type { ModelTier, SupportedProvider } from '@/tree/research/tradingagents';

/** Canned JSON responses keyed by agent role (detected via systemPrompt). */
const CANNED_RESPONSES: Record<string, string> = {
  analyst: JSON.stringify({ claim: 'Fundamental metrics support the thesis', evidence: ['Revenue growth 15%', 'Margin expansion'] }),
  'bull-researcher': JSON.stringify({
    thesis: 'Momentum persists in trending regime',
    evidence: ['Trend strength above 20-day MA', 'Volume confirmation'],
    mechanism: 'Trend-following momentum drives continued returns due to persistent investor flows',
    expectedDirection: 'long',
    horizon: 20,
    features: ['momentum_20d', 'volume_ratio'],
  }),
  'bear-researcher': JSON.stringify({
    thesis: 'Mean reversion dominates after overextension',
    evidence: ['RSI above 70', 'Divergence in volume'],
    mechanism: 'Overextension in momentum leads to reversal as positioning unwinds',
    expectedDirection: 'short',
    horizon: 20,
    features: ['rsi_14', 'volume_divergence'],
  }),
  'research-manager': JSON.stringify({
    thesis: 'Momentum with mean-reversion guard',
    strongestEvidence: 'Trend strength above 20-day MA',
    strongestCounterEvidence: 'RSI above 70',
    unresolvedUncertainty: 'Regime transition timing',
    falsifiableAssumptions: [{ statement: 'Trend persists 20 bars', howToFalsify: 'Break below 20-day MA' }],
    proposedExperiments: [{ hypothesisRef: 'momentum-20d', method: 'Walk-forward OOS' }],
  }),
  'risk-advisor': JSON.stringify({
    expectedRegime: 'TREND_UP',
    keyRisks: ['Regime shift', 'Liquidity gap'],
    failureConditions: ['Drawdown exceeds 5%', 'Correlation spike'],
    maxAcceptableExposure: 0.6,
    liquidityConcern: 'moderate',
    volatilityConcern: 'high',
    correlationConcern: 'low',
  }),
  'portfolio-advisor': JSON.stringify({
    assets: ['alpha-momentum'],
    weights: [0.3],
    hedge: 'volatility overlay',
    rebalance: 'weekly',
    exposure: 0.5,
  }),
};

/** Detect agent role from systemPrompt. */
function detectRole(systemPrompt: string | undefined): string {
  if (!systemPrompt) return 'analyst';
  if (systemPrompt.includes('bull researcher')) return 'bull-researcher';
  if (systemPrompt.includes('bear researcher')) return 'bear-researcher';
  if (systemPrompt.includes('research manager')) return 'research-manager';
  if (systemPrompt.includes('risk advisor')) return 'risk-advisor';
  if (systemPrompt.includes('portfolio advisor')) return 'portfolio-advisor';
  return 'analyst';
}

/** Deterministic fixture provider (D11 labeled TEST seam). */
export class DeterministicFixtureProvider implements LlmProvider {
  readonly providerId: SupportedProvider = 'Anthropic';
  readonly displayName = 'Deterministic Fixture Provider (TEST)';
  readonly models: Readonly<Record<ModelTier, string>> = {
    FAST: 'fixture-fast',
    REASONING: 'fixture-reasoning',
    LOCAL: 'fixture-local',
  };
  readonly isConfigured = true;

  async call(input: LlmProviderInput): Promise<LlmProviderResult> {
    const role = detectRole(input.systemPrompt);
    const text = CANNED_RESPONSES[role] ?? CANNED_RESPONSES.analyst;
    return {
      text,
      usage: { promptTokens: 100, completionTokens: 50 },
      latencyMs: 10,
    };
  }
}

/** A provider that always fails (for fallback/error tests). */
export class FailingProvider implements LlmProvider {
  readonly providerId: SupportedProvider = 'Anthropic';
  readonly displayName = 'Failing Provider (TEST)';
  readonly models: Readonly<Record<ModelTier, string>> = {
    FAST: 'failing-fast',
    REASONING: 'failing-reasoning',
    LOCAL: 'failing-local',
  };
  readonly isConfigured = true;

  async call(): Promise<LlmProviderResult> {
    throw new Error('provider intentionally failed');
  }
}

/**
 * Build a deterministic fixture provider with a SPECIFIC providerId.
 * The `DeterministicFixtureProvider` class hardcodes its id to 'Anthropic'
 * (every instance reports the same id), so a registry built from two
 * instances trips the duplicate-id guard. Use this factory when you need
 * two DISTINCT providers (primary + fallback) in the same registry.
 */
export function makeFixtureProvider(providerId: SupportedProvider): LlmProvider {
  return {
    providerId,
    displayName: `Fixture ${providerId} (TEST)`,
    models: { FAST: 'fixture-fast', REASONING: 'fixture-reasoning', LOCAL: 'fixture-local' },
    isConfigured: true,
    async call(input: LlmProviderInput): Promise<LlmProviderResult> {
      const role = detectRole(input.systemPrompt);
      const text = CANNED_RESPONSES[role] ?? CANNED_RESPONSES.analyst;
      return { text, usage: { promptTokens: 100, completionTokens: 50 }, latencyMs: 10 };
    },
  };
}

/** A failing fixture provider with a configurable id (for fallback tests). */
export function makeFailingFixtureProvider(providerId: SupportedProvider): LlmProvider {
  return {
    providerId,
    displayName: `Failing ${providerId} (TEST)`,
    models: { FAST: 'failing-fast', REASONING: 'failing-reasoning', LOCAL: 'failing-local' },
    isConfigured: true,
    async call(): Promise<LlmProviderResult> {
      throw new Error('provider intentionally failed');
    },
  };
}
