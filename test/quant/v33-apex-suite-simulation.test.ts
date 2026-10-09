import { describe, expect, it } from 'vitest';
import { computeAlmgrenLorenzExecution } from '@/tree/quantlib/execution/almgren-lorenz-engine';
import { computeEasleyOharaAsymmetry } from '@/tree/quantlib/microstructure/easley-ohara-engine';
import { executeRouteCall } from '@/forest/research/tradingagents/model-router-execute';
import { DeterministicMockLLMProvider } from '@/forest/alpha/research-agent/mock-provider';
import type { ProviderRegistry, LlmProvider } from '@/forest/research/tradingagents/provider-adapter';

describe('Triad v33 Apex Multi-Domain Quantitative & Architecture Suite Simulation', () => {
  it('integrates Almgren-Lorenz execution, Easley-O\'Hara asymmetry, model-router & mock-provider', async () => {
    // 1. Almgren-Lorenz adaptive execution
    const exec = computeAlmgrenLorenzExecution({
      totalShares: 2000,
      timeHorizon: 1.0,
      numSteps: 4,
      volatility: 0.02,
      urgencyCoeff: 0.002,
      adaptiveSensitivity: 0.8,
      initialPrice: 150,
      temporaryImpactCoeff: 0.004,
      priceTrajectory: [150, 153, 155, 158],
    });
    expect(exec.terminalShares).toBe(0);
    expect(exec.trajectory.length).toBe(4);
    expect(exec.vwapPrice).toBeGreaterThan(0);

    // 2. Easley-O'Hara trade-size information asymmetry
    const asymmetry = computeEasleyOharaAsymmetry({
      eventProbability: 0.35,
      informedLargeFraction: 0.75,
      uninformedSmallRate: 60,
      uninformedLargeRate: 15,
      informedRate: 50,
      baseAssetPrice: 150,
      volatility: 0.025,
    });
    expect(asymmetry.pinLarge).toBeGreaterThan(asymmetry.pinSmall);
    expect(asymmetry.sizeAsymmetryRatio).toBeGreaterThan(1.0);
    expect(asymmetry.largeOrderAdverseSelectionMarkup).toBeGreaterThan(0);

    // 3. Mock LLM Provider
    const mockProvider = new DeterministicMockLLMProvider();
    const completion = await mockProvider.generateCompletion({
      capability: 'hypothesis_generation',
      systemPrompt: 'System prompt instructions',
      userPrompt: 'Test user prompt',
    });
    expect(completion).toBeTruthy();
    expect(mockProvider.getCallHistory().length).toBe(1);

    // 4. Model Router Execution with Mock Provider Registry
    const mockProviderInstance: LlmProvider = {
      providerId: 'Anthropic',
      displayName: 'Anthropic Test',
      isConfigured: true,
      models: { FAST: 'claude-3-haiku', REASONING: 'claude-3-opus', LOCAL: 'local-model' },
      call: async () => ({
        text: 'canned response',
        usage: { promptTokens: 10, completionTokens: 15 },
        latencyMs: 45,
      }),
    };

    const mockRegistry: ProviderRegistry = {
      providers: new Map([['Anthropic', mockProviderInstance]]),
      get: (id) => (id === 'Anthropic' ? mockProviderInstance : null),
      getPrimaryForTier: () => mockProviderInstance,
      getFallbackForTier: () => null,
    };

    const routeOutcome = await executeRouteCall(
      'bull-researcher',
      'research-synthesis',
      { prompt: 'test' },
      mockRegistry,
      5000,
    );
    expect(routeOutcome.ok).toBe(true);
    if (routeOutcome.ok) {
      expect(routeOutcome.value.text).toBe('canned response');
      expect(routeOutcome.value.fallbackUsed).toBe(false);
      expect(routeOutcome.value.provenance.provenance.providerId).toBe('Anthropic');
    }
  });
});
