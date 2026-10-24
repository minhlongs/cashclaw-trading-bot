import { describe, expect, it } from 'vitest';
import { computeHubbertElasticityExecution } from '../../src/tree/quantlib/execution/hubbert-elasticity-engine';
import { computeMadhavanSmidtDecomposition } from '../../src/tree/quantlib/microstructure/madhavan-smidt-spread-engine';
import type { MadhavanSmidtTick } from '../../src/tree/quantlib/microstructure/madhavan-smidt-spread-engine';
import { PromotionGateConfigSchema, PromotionGateResultSchema } from '../../src/forest/alpha/gate/schemas';
import { formatHypothesisPrompt, formatFeatureProposalPrompt, ProviderError } from '../../src/forest/alpha/research-agent/provider';

describe('V26 Apex Suite Cross-Domain Quantitative & Architecture Simulation', () => {
  it('integrates microstructure spread, execution elasticity, promotion gates, and provider prompts', () => {
    // 1. Madhavan-Smidt Microstructure Decomposition
    const ticks: MadhavanSmidtTick[] = [
      { price: 100.0, midpoint: 100.0, direction: 1, inventory: 10 },
      { price: 100.25, midpoint: 100.1, direction: 1, inventory: 9 },
      { price: 99.8, midpoint: 100.0, direction: -1, inventory: 10 },
      { price: 100.15, midpoint: 100.05, direction: 1, inventory: 8 },
      { price: 99.85, midpoint: 99.95, direction: -1, inventory: 9 },
      { price: 100.3, midpoint: 100.15, direction: 1, inventory: 7 },
    ];
    const msResult = computeMadhavanSmidtDecomposition(ticks);
    expect(msResult.spread).toBeGreaterThan(0);
    expect(msResult.orderProcessingShare + msResult.adverseSelectionShare + msResult.inventoryHoldingShare).toBeCloseTo(1.0, 4);

    // 2. Hubbert (2012) Transient Liquidity Elasticity Optimal Execution
    const execResult = computeHubbertElasticityExecution({
      totalShares: 10_000,
      numSteps: 4,
      elasticityAlpha: 0.25,
      baseResilience: 0.35,
      timeStep: 1.0,
      depthParameter: 10_000,
    });
    expect(execResult.trajectory).toHaveLength(4);
    expect(execResult.liquiditySavings).toBeGreaterThanOrEqual(0);

    // 3. Promotion Gate Schema Validation
    const gateConfig = PromotionGateConfigSchema.parse({
      minTrades: 50,
      minNetExpectancy: 0.05,
    });
    expect(gateConfig.minTrades).toBe(50);

    const gateResult = PromotionGateResultSchema.parse({
      passed: true,
      verdict: 'PASSED',
      checks: [],
      failedChecks: [],
      diagnosticReasons: [],
      timestamp: Date.now(),
    });
    expect(gateResult.verdict).toBe('PASSED');

    // 4. Research Agent Provider Prompts & Errors
    const hypothesisPrompt = formatHypothesisPrompt({
      domainCategory: 'microstructure',
      targetRegime: 'bull',
    });
    expect(hypothesisPrompt.capability).toBe('hypothesis_generation');

    const featurePrompt = formatFeatureProposalPrompt({
      targetHypothesisId: 'hypo-001',
      candidateIndicators: ['spread', 'elasticity'],
    });
    expect(featurePrompt.capability).toBe('feature_proposal');

    const err = new ProviderError('Timeout in LLM call', { code: 'TIMEOUT', providerName: 'open-router' });
    expect(err.code).toBe('TIMEOUT');
  });
});
