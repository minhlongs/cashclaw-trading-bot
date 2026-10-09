import { describe, it, expect } from 'vitest';
import { KyleLambdaEngine } from '../../src/tree/quantlib/microstructure/kyle-lambda-engine';
import { GatheralRoughVolatilityEngine } from '../../src/tree/quantlib/volatility/gatheral-rough-volatility';
import { DeterministicMockLLMProvider } from '../../src/forest/alpha/research-agent/mock-provider';
import { simulateShadowFill } from '../../src/tree/alpha/observability/shadow-simulator';

describe('v15 Apex Multi-Domain Suite End-to-End Simulation', () => {
  it('executes cohesive v15 quantitative simulation across adverse selection, rough volatility & observability', async () => {
    // 1. Pillar 1: Kyle (1985) Microstructure Adverse Selection Price Impact
    const kyleEngine = new KyleLambdaEngine({
      minObservations: 4,
      adverseSelectionThreshold: 0.03,
    });
    const orderFlowSeries = [
      { orderFlow: 50, priceChange: 2.0 },
      { orderFlow: -50, priceChange: -2.0 },
      { orderFlow: 80, priceChange: 3.2 },
      { orderFlow: -80, priceChange: -3.2 },
    ];
    const kyleResult = kyleEngine.estimateLambda(orderFlowSeries);
    expect(kyleResult.sampleCount).toBe(4);
    expect(kyleResult.lambda).toBeCloseTo(0.04, 3);
    expect(kyleResult.isInformedFlowDominant).toBe(true);

    // 2. Pillar 2: Gatheral (2018) Rough Volatility Hurst Exponent Estimator
    const roughVolEngine = new GatheralRoughVolatilityEngine({
      minObservations: 20,
      maxLag: 5,
      roughThreshold: 0.45,
    });
    const logVolSeries: number[] = [];
    let curVol = 0.5;
    for (let i = 0; i < 30; i++) {
      curVol += (i % 2 === 0 ? 0.04 : -0.039) * (1 + (i % 3) * 0.1);
      logVolSeries.push(curVol);
    }
    const hurstResult = roughVolEngine.estimateHurst(logVolSeries);
    expect(hurstResult.sampleCount).toBe(30);
    expect(hurstResult.hurstExponent).toBeLessThan(0.45);
    expect(hurstResult.isRoughRegime).toBe(true);

    // 3. Pillar 3: Modularized Mock Provider & Shadow Simulator
    const mockProvider = new DeterministicMockLLMProvider();
    const completion = await mockProvider.generateCompletion({
      capability: 'hypothesis_generation',
      systemPrompt: 'You are an alpha researcher',
      userPrompt: 'Generate microstructure hypothesis',
    });
    expect(completion).toContain('Funding-Volume Divergence Reversion');

    const shadowOrder = {
      orderId: 'so-sim-v15-01',
      symbol: 'BTC/USDT',
      side: 'buy' as const,
      price: 60000,
      size: 12000,
      targetWeightDelta: 0.05,
      decisionTimestamp: Date.now() - 50,
    };
    const fill = simulateShadowFill(shadowOrder, {
      arrivalPrice: 60005,
      latencyMs: 25,
      stressTier: 'normal',
    });
    expect(fill.fillPrice).toBeGreaterThan(60000);
    expect(fill.orderId).toBe('so-sim-v15-01');
  });
});
