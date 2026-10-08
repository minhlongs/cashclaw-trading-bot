import { describe, expect, it } from 'vitest';
import { RegimeLabel } from '@/tree/regime/types';
import { computeFeatureSnapshotHashSync } from '@/tree/alpha/observability';
import {
  computeAttribution,
  createSyntheticAlphaDecision,
  createSyntheticOperationalTelemetry,
  createSyntheticPortfolioDecision,
  evaluateTelemetryHealth,
  generateShadowOrder,
  simulateShadowFill,
} from './harness';

describe('Tier 4: Real-World Scenarios (S1-S5)', () => {
  it('S1: Multi-Asset Regime Transition (TREND_UP to SHOCK)', () => {
    const preAlpha = createSyntheticAlphaDecision({ alphaId: 'btc-trend', direction: 'buy', confidence: 0.85, regime: RegimeLabel.TREND_UP });
    const prePort = createSyntheticPortfolioDecision({ targetWeights: { 'BTC/USDT': 0.6, 'ETH/USDT': 0.4 }, grossExposure: 1.0, volTargetingScale: 1.0 });
    expect(preAlpha.direction).toBe('buy');

    // Transition to SHOCK: vol targeting cuts scale to 0.2
    const postAlpha = createSyntheticAlphaDecision({ alphaId: 'btc-trend', direction: 'sell', confidence: 0.4, regime: RegimeLabel.SHOCK });
    const postPort = createSyntheticPortfolioDecision({
      targetWeights: { 'BTC/USDT': 0.12, 'ETH/USDT': 0.08 },
      grossExposure: 0.2,
      volTargetingScale: 0.2,
      activeRiskOverlayAdjustments: ['vol target: scaled by 0.2 (port vol 0.45 -> 0.09)'],
    });

    const deltaW = postPort.targetWeights['BTC/USDT'] - prePort.targetWeights['BTC/USDT'];
    expect(deltaW).toBeCloseTo(-0.48, 4);

    const sellOrder = generateShadowOrder({ orderId: 'ord-s1', symbol: 'BTC/USDT', deltaW, price: 60000, equity: 100000, timestamp: 2000 })!;
    expect(sellOrder.side).toBe('sell');
    expect(sellOrder.size).toBeCloseTo(48000, 2);

    const fill = simulateShadowFill({ order: sellOrder, arrivalPrice: 59500, latencyMs: 40, stressTier: 'adverse' });
    expect(fill.fillPrice).toBeLessThan(59500);

    const attr = computeAttribution({
      expectedReturn: postAlpha.expectedReturn, expectedCost: postAlpha.expectedCost,
      realizedFillPrice: fill.fillPrice, exitPrice: 59000, side: 'sell',
      feeAmount: fill.feeAmount, fillNotional: fill.fillPrice * fill.fillQuantity,
      expectedSlippageBps: 10, realizedSlippageBps: fill.slippageBps,
    });
    expect(attr.deltaEdge).toBeDefined();
  });

  it('S2: High Latency & Stale Feed Alarm', () => {
    const degradedTelemetry = createSyntheticOperationalTelemetry({
      decisionLatencyMs: 3500,
      dataFreshnessMs: 5200,
      providerProvenance: { primaryProvider: 'binance-ws', activeProvider: 'binance-ws', usedFallback: false, fallbackAttempts: 0 },
    });

    const health = evaluateTelemetryHealth(degradedTelemetry);
    expect(health.status).toBe('critical');
    expect(health.alarms).toContain('STALE_DATA');
    expect(health.alarms).toContain('HIGH_LATENCY');

    const order = generateShadowOrder({ orderId: 'ord-s2', symbol: 'BTC/USDT', deltaW: 0.1, price: 50000, equity: 100000, timestamp: 1000 })!;
    const fill = simulateShadowFill({ order, arrivalPrice: 50000, latencyMs: degradedTelemetry.decisionLatencyMs, stressTier: 'normal' });
    expect(fill.fillTimestamp).toBe(1000 + 3500);
  });

  it('S3: Provider Failover & Provenance Recovery', () => {
    const failoverTelemetry = createSyntheticOperationalTelemetry({
      decisionLatencyMs: 380,
      dataFreshnessMs: 420,
      providerProvenance: {
        primaryProvider: 'binance-ws',
        activeProvider: 'bybit-ws',
        usedFallback: true,
        fallbackAttempts: 2,
        providerLatencyMs: 350,
        circuitState: 'degraded',
      },
    });

    const health = evaluateTelemetryHealth(failoverTelemetry);
    expect(health.status).toBe('degraded');
    expect(health.alarms).toContain('PROVIDER_FALLBACK');
    expect(health.alarms).toContain('CIRCUIT_DEGRADED');

    const order = generateShadowOrder({ orderId: 'ord-s3', symbol: 'ETH/USDT', deltaW: 0.15, price: 3000, equity: 100000, timestamp: 5000 })!;
    const fill = simulateShadowFill({ order, arrivalPrice: 3010, latencyMs: failoverTelemetry.decisionLatencyMs, stressTier: 'conservative' });
    expect(fill.fillTimestamp).toBe(5380);
    expect(fill.slippageBps).toBeGreaterThan(0);
  });

  it('S4: Extreme Cost Stress Liquidity Squeeze', () => {
    const order = generateShadowOrder({ orderId: 'ord-s4', symbol: 'BTC/USDT', deltaW: 1.0, price: 50000, equity: 100000, timestamp: 1000 })!;
    expect(order.size).toBe(100000);

    const extremeFill = simulateShadowFill({ order, arrivalPrice: 50000, latencyMs: 50, stressTier: 'extreme' });
    expect(extremeFill.fillPrice).toBe(50425); // 50000 * (1 + 0.0085)
    expect(extremeFill.slippageBps).toBe(85);
    expect(extremeFill.feeAmount).toBe(151.275); // 50425 * 2.0 * 0.0015

    const attr = computeAttribution({
      expectedReturn: 0.005, expectedCost: 0.001, realizedFillPrice: extremeFill.fillPrice, exitPrice: 50100,
      side: 'buy', feeAmount: extremeFill.feeAmount, fillNotional: extremeFill.fillPrice * extremeFill.fillQuantity,
      expectedSlippageBps: 8, realizedSlippageBps: extremeFill.slippageBps,
    });
    expect(attr.deltaSlippageBps).toBe(77);
    expect(attr.deltaEdge).toBeLessThan(0);
  });

  it('S5: Rebalancing Invariance & Feature Hash Stability', () => {
    const featureVector = { rsi: 52.3, macd: 0.0014, btc_dom: 54.2, timestamp: 1710000000000 };
    const initialHash = computeFeatureSnapshotHashSync(featureVector);

    let emittedOrderCount = 0;
    const currentWeight = 0.5;
    const targetWeight = 0.5;
    const deltaW = targetWeight - currentWeight;

    for (let tick = 0; tick < 100; tick++) {
      const tickHash = computeFeatureSnapshotHashSync(featureVector);
      expect(tickHash).toBe(initialHash);

      const order = generateShadowOrder({ orderId: `ord-s5-${tick}`, symbol: 'BTC/USDT', deltaW, price: 50000, equity: 100000, timestamp: 1710000000000 + tick * 1000 });
      if (order !== null) emittedOrderCount++;
    }

    expect(emittedOrderCount).toBe(0);
  });
});
