import { describe, expect, it } from 'vitest';
import { RegimeLabel } from '@/tree/regime/types';
import {
  computeAttribution,
  createSyntheticAlphaDecision,
  createSyntheticOperationalTelemetry,
  createSyntheticPortfolioDecision,
  evaluateTelemetryHealth,
  generateShadowOrder,
  simulateShadowFill,
} from './harness';

describe('Tier 3: Cross-Feature Interactions', () => {
  it('P1: Feature Hashing × AlphaDecisionRecord provenance integrity', () => {
    const featureSet = { rsi: 65.5, macd: { diff: 0.001, signal: 0.0008 }, regime: 'TREND_UP' };
    const record = createSyntheticAlphaDecision({ metadata: featureSet, regime: RegimeLabel.TREND_UP });
    expect(record.featureSnapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.featureDependencies).toContain('rsi');
  });

  it('P2: Portfolio Decision × Shadow Orders × 4-Tier Stress Fills', () => {
    const port = createSyntheticPortfolioDecision({
      targetWeights: { 'BTC/USDT': 0.8, 'ETH/USDT': 0.2 },
      grossExposure: 1.0,
      netExposure: 1.0,
    });
    const order = generateShadowOrder({
      orderId: 'ord-p2',
      symbol: 'BTC/USDT',
      deltaW: port.targetWeights['BTC/USDT'],
      price: 60000,
      equity: 100000,
      timestamp: port.timestamp,
    })!;
    expect(order.size).toBe(80000);

    const normalFill = simulateShadowFill({ order, arrivalPrice: 60000, latencyMs: 20, stressTier: 'normal' });
    const extremeFill = simulateShadowFill({ order, arrivalPrice: 60000, latencyMs: 20, stressTier: 'extreme' });
    expect(extremeFill.fillPrice).toBeGreaterThan(normalFill.fillPrice);
    expect(extremeFill.feeAmount).toBeGreaterThan(normalFill.feeAmount);
  });

  it('P3: Shadow Fills × Attribution across increasing stress tiers', () => {
    const order = generateShadowOrder({ orderId: 'ord-p3', symbol: 'BTC/USDT', deltaW: 0.1, price: 50000, equity: 100000, timestamp: 1000 })!;
    const normalFill = simulateShadowFill({ order, arrivalPrice: 50000, latencyMs: 20, stressTier: 'normal' });
    const extremeFill = simulateShadowFill({ order, arrivalPrice: 50000, latencyMs: 20, stressTier: 'extreme' });

    const normalAttr = computeAttribution({
      expectedReturn: 0.015, expectedCost: 0.002, realizedFillPrice: normalFill.fillPrice, exitPrice: 50500,
      side: 'buy', feeAmount: normalFill.feeAmount, fillNotional: 10000, expectedSlippageBps: 8, realizedSlippageBps: normalFill.slippageBps,
    });
    const extremeAttr = computeAttribution({
      expectedReturn: 0.015, expectedCost: 0.002, realizedFillPrice: extremeFill.fillPrice, exitPrice: 50500,
      side: 'buy', feeAmount: extremeFill.feeAmount, fillNotional: 10000, expectedSlippageBps: 8, realizedSlippageBps: extremeFill.slippageBps,
    });
    expect(extremeAttr.deltaEdge).toBeLessThan(normalAttr.deltaEdge);
    expect(extremeAttr.deltaSlippageBps).toBeGreaterThan(normalAttr.deltaSlippageBps);
  });

  it('P4: Operational Telemetry Drift × Evaluation Alarm triggers', () => {
    const nominal = createSyntheticOperationalTelemetry({ dataFreshnessMs: 50, decisionLatencyMs: 30 });
    const degraded = createSyntheticOperationalTelemetry({ dataFreshnessMs: 6000, decisionLatencyMs: 4000 });

    const resNominal = evaluateTelemetryHealth(nominal);
    const resDegraded = evaluateTelemetryHealth(degraded);

    expect(resNominal.status).toBe('healthy');
    expect(resNominal.alarms).toHaveLength(0);
    expect(resDegraded.status).toBe('critical');
    expect(resDegraded.alarms).toContain('STALE_DATA');
    expect(resDegraded.alarms).toContain('HIGH_LATENCY');
  });

  it('P5: Provider Failover × Order Latency Penalty × Slippage Degradation', () => {
    const primaryTelemetry = createSyntheticOperationalTelemetry({ decisionLatencyMs: 20, providerProvenance: { primaryProvider: 'binance', activeProvider: 'binance', usedFallback: false, fallbackAttempts: 0 } });
    const fallbackTelemetry = createSyntheticOperationalTelemetry({ decisionLatencyMs: 250, providerProvenance: { primaryProvider: 'binance', activeProvider: 'bybit', usedFallback: true, fallbackAttempts: 2 } });

    const order = generateShadowOrder({ orderId: 'ord-p5', symbol: 'BTC/USDT', deltaW: 0.2, price: 50000, equity: 100000, timestamp: 1000 })!;
    const fillPrimary = simulateShadowFill({ order, arrivalPrice: 50000, latencyMs: primaryTelemetry.decisionLatencyMs, stressTier: 'normal' });
    const fillFallback = simulateShadowFill({ order, arrivalPrice: 50100, latencyMs: fallbackTelemetry.decisionLatencyMs, stressTier: 'normal' });

    expect(fillFallback.fillTimestamp).toBeGreaterThan(fillPrimary.fillTimestamp);
    expect(fillFallback.slippageBps).toBeGreaterThan(fillPrimary.slippageBps);
  });

  it('P6: Vol-Targeting Scale Adjustment × Shadow Order Sizing × Fee Drag', () => {
    const basePort = createSyntheticPortfolioDecision({ targetWeights: { 'BTC/USDT': 0.5 }, volTargetingScale: 1.0 });
    const deriskPort = createSyntheticPortfolioDecision({ targetWeights: { 'BTC/USDT': 0.25 }, volTargetingScale: 0.5, activeRiskOverlayAdjustments: ['vol target: scaled by 0.5'] });

    const baseOrder = generateShadowOrder({ orderId: 'ord-base', symbol: 'BTC/USDT', deltaW: basePort.targetWeights['BTC/USDT'], price: 50000, equity: 100000, timestamp: 1000 })!;
    const deriskOrder = generateShadowOrder({ orderId: 'ord-derisk', symbol: 'BTC/USDT', deltaW: deriskPort.targetWeights['BTC/USDT'], price: 50000, equity: 100000, timestamp: 1000 })!;

    expect(deriskOrder.size).toBe(baseOrder.size * 0.5);

    const baseFill = simulateShadowFill({ order: baseOrder, arrivalPrice: 50000, latencyMs: 20, stressTier: 'normal' });
    const deriskFill = simulateShadowFill({ order: deriskOrder, arrivalPrice: 50000, latencyMs: 20, stressTier: 'normal' });

    expect(deriskFill.feeAmount).toBeCloseTo(baseFill.feeAmount * 0.5, 4);
  });
});
