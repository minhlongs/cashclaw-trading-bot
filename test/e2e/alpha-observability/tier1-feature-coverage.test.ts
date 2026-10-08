import { describe, expect, it } from 'vitest';
import { RegimeLabel } from '@/tree/regime/types';
import { computeFeatureSnapshotHash, computeFeatureSnapshotHashSync } from '@/tree/alpha/observability';
import {
  computeAttribution,
  createSyntheticAlphaDecision,
  createSyntheticOperationalTelemetry,
  createSyntheticPortfolioDecision,
  evaluateTelemetryHealth,
  generateShadowOrder,
  simulateShadowFill,
} from './harness';

describe('Tier 1: Feature Coverage (F1-F5)', () => {
  describe('F1: Telemetry Contracts', () => {
    it('validates complete AlphaDecisionRecord with positive confidence and valid regime', () => {
      const record = createSyntheticAlphaDecision({ alphaId: 'alpha-1', confidence: 0.9, regime: RegimeLabel.TREND_UP });
      expect(record.alphaId).toBe('alpha-1');
      expect(record.confidence).toBe(0.9);
      expect(record.direction).toBe('buy');
    });

    it('validates PortfolioDecisionRecord with multi-asset weights and gross/net exposures', () => {
      const port = createSyntheticPortfolioDecision({ targetWeights: { 'BTC/USDT': 0.7, 'ETH/USDT': 0.3 }, grossExposure: 1.0, netExposure: 1.0 });
      expect(port.targetWeights['BTC/USDT']).toBe(0.7);
      expect(port.grossExposure).toBe(1.0);
    });

    it('validates OperationalTelemetry with primary provider provenance and zero drift', () => {
      const tel = createSyntheticOperationalTelemetry({ decisionLatencyMs: 25, dataFreshnessMs: 50 });
      expect(tel.decisionLatencyMs).toBe(25);
      expect(tel.providerProvenance.usedFallback).toBe(false);
    });

    it('validates ProviderProvenance with circuit state and fallback attempt tracking', () => {
      const tel = createSyntheticOperationalTelemetry({
        providerProvenance: { primaryProvider: 'binance', activeProvider: 'bybit', usedFallback: true, fallbackAttempts: 2, circuitState: 'degraded' },
      });
      expect(tel.providerProvenance.usedFallback).toBe(true);
      expect(tel.providerProvenance.fallbackAttempts).toBe(2);
    });

    it('validates ShadowFill contract with all 4 stress tiers and exact causality', () => {
      const order = generateShadowOrder({ orderId: 'o-1', symbol: 'BTC/USDT', deltaW: 0.1, price: 50000, equity: 100000, timestamp: 1000 })!;
      for (const tier of ['normal', 'conservative', 'adverse', 'extreme'] as const) {
        const fill = simulateShadowFill({ order, arrivalPrice: 50000, latencyMs: 50, stressTier: tier });
        expect(fill.stressTier).toBe(tier);
        expect(fill.fillTimestamp).toBe(1050);
      }
    });
  });

  describe('F2: Feature Snapshot Hashing', () => {
    it('computes deterministic 64-char lowercase hex hash from feature payload', () => {
      const hash = computeFeatureSnapshotHashSync({ rsi: 50, vol: 0.02 });
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(hash).toBe(computeFeatureSnapshotHashSync({ rsi: 50, vol: 0.02 }));
    });

    it('guarantees key ordering invariance for arbitrary unordered object keys', () => {
      const h1 = computeFeatureSnapshotHashSync({ a: 1, b: 2, c: { d: 3, e: 4 } });
      const h2 = computeFeatureSnapshotHashSync({ c: { e: 4, d: 3 }, b: 2, a: 1 });
      expect(h1).toBe(h2);
    });

    it('omits undefined properties consistently with canonical JSON specification', () => {
      expect(computeFeatureSnapshotHashSync({ a: 1, b: undefined })).toBe(computeFeatureSnapshotHashSync({ a: 1 }));
    });

    it('preserves array element ordering sensitivity', () => {
      expect(computeFeatureSnapshotHashSync({ arr: [1, 2, 3] })).not.toBe(computeFeatureSnapshotHashSync({ arr: [3, 2, 1] }));
    });

    it('ensures parity between synchronous and asynchronous hashing functions', async () => {
      const payload = { signal: 0.75, horizon: '1h', factors: ['mom', 'rev'] };
      expect(computeFeatureSnapshotHashSync(payload)).toBe(await computeFeatureSnapshotHash(payload));
    });
  });

  describe('F3: Hypothetical Shadow Order Generation', () => {
    it('generates buy order when target weight delta is positive', () => {
      const order = generateShadowOrder({ orderId: 'o-buy', symbol: 'BTC/USDT', deltaW: 0.2, price: 60000, equity: 50000, timestamp: 1000 })!;
      expect(order.side).toBe('buy');
      expect(order.size).toBe(10000);
      expect(order.targetWeightDelta).toBe(0.2);
    });

    it('generates sell order when target weight delta is negative', () => {
      const order = generateShadowOrder({ orderId: 'o-sell', symbol: 'ETH/USDT', deltaW: -0.15, price: 3000, equity: 100000, timestamp: 2000 })!;
      expect(order.side).toBe('sell');
      expect(order.size).toBe(15000);
      expect(order.targetWeightDelta).toBe(-0.15);
    });

    it('suppresses order generation when weight delta is zero (within epsilon)', () => {
      expect(generateShadowOrder({ orderId: 'o-zero', symbol: 'BTC/USDT', deltaW: 0.0, price: 60000, equity: 100000, timestamp: 1000 })).toBeNull();
    });

    it('sets order price strictly to decision benchmark price without lookahead bias', () => {
      const order = generateShadowOrder({ orderId: 'o-p', symbol: 'SOL/USDT', deltaW: 0.05, price: 150.25, equity: 20000, timestamp: 3000 })!;
      expect(order.price).toBe(150.25);
      expect(order.decisionTimestamp).toBe(3000);
    });

    it('scales notional size and quantity linearly with portfolio equity', () => {
      const o1 = generateShadowOrder({ orderId: 'o-1', symbol: 'BTC/USDT', deltaW: 0.1, price: 50000, equity: 100000, timestamp: 1000 })!;
      const o2 = generateShadowOrder({ orderId: 'o-2', symbol: 'BTC/USDT', deltaW: 0.1, price: 50000, equity: 200000, timestamp: 1000 })!;
      expect(o2.size).toBe(o1.size * 2);
    });
  });

  describe('F4: Shadow Fill Simulator', () => {
    const baseOrder = generateShadowOrder({ orderId: 'o-fill', symbol: 'BTC/USDT', deltaW: 0.1, price: 50000, equity: 100000, timestamp: 1000 })!;

    it('simulates normal tier fill with 8 bps fee and 8 bps slippage/impact', () => {
      const fill = simulateShadowFill({ order: baseOrder, arrivalPrice: 50000, latencyMs: 20, stressTier: 'normal' });
      expect(fill.fillPrice).toBe(50040); // 50000 * 1.0008
      expect(fill.feeAmount).toBe(8.0064); // 50040 * 0.2 * 0.0008
    });

    it('simulates conservative tier fill with 10 bps fee and 17 bps slippage/impact', () => {
      const fill = simulateShadowFill({ order: baseOrder, arrivalPrice: 50000, latencyMs: 20, stressTier: 'conservative' });
      expect(fill.fillPrice).toBe(50085); // 50000 * 1.0017
      expect(fill.feeAmount).toBe(10.017); // 50085 * 0.2 * 0.0010
    });

    it('simulates adverse tier fill with 10 bps fee and 40 bps slippage/impact', () => {
      const fill = simulateShadowFill({ order: baseOrder, arrivalPrice: 50000, latencyMs: 30, stressTier: 'adverse' });
      expect(fill.fillPrice).toBe(50200); // 50000 * 1.0040
      expect(fill.feeAmount).toBe(10.04);
    });

    it('simulates extreme tier fill with 15 bps fee and 85 bps slippage/impact', () => {
      const fill = simulateShadowFill({ order: baseOrder, arrivalPrice: 50000, latencyMs: 50, stressTier: 'extreme' });
      expect(fill.fillPrice).toBe(50425); // 50000 * 1.0085
      expect(fill.feeAmount).toBe(15.1275);
    });

    it('enforces causal timestamp ordering (fillTimestamp = decisionTimestamp + latencyMs)', () => {
      const fill = simulateShadowFill({ order: baseOrder, arrivalPrice: 50000, latencyMs: 150, stressTier: 'normal' });
      expect(fill.fillTimestamp).toBe(baseOrder.decisionTimestamp + 150);
    });
  });

  describe('F5: Expected vs. Realized Edge & Slippage Attribution', () => {
    it('computes positive ΔEdge when realized net return exceeds research expectation', () => {
      const attr = computeAttribution({
        expectedReturn: 0.01, expectedCost: 0.002, realizedFillPrice: 50000, exitPrice: 50750,
        side: 'buy', feeAmount: 10, fillNotional: 10000, expectedSlippageBps: 8, realizedSlippageBps: 6,
      });
      expect(attr.expectedNetReturn).toBe(0.008);
      expect(attr.realizedNetReturn).toBe(0.014);
      expect(attr.deltaEdge).toBe(0.006);
    });

    it('computes negative ΔEdge when execution drag erodes research alpha', () => {
      const attr = computeAttribution({
        expectedReturn: 0.01, expectedCost: 0.002, realizedFillPrice: 50000, exitPrice: 50100,
        side: 'buy', feeAmount: 20, fillNotional: 10000, expectedSlippageBps: 8, realizedSlippageBps: 25,
      });
      expect(attr.deltaEdge).toBeLessThan(0);
    });

    it('computes exact ΔSlippage bps between realized and modeled slippage', () => {
      const attr = computeAttribution({
        expectedReturn: 0.01, expectedCost: 0.002, realizedFillPrice: 50000, exitPrice: 50500,
        side: 'buy', feeAmount: 10, fillNotional: 10000, expectedSlippageBps: 8.5, realizedSlippageBps: 14.0,
      });
      expect(attr.deltaSlippageBps).toBe(5.5);
    });

    it('evaluates healthy operational state when latency and freshness are nominal', () => {
      const health = evaluateTelemetryHealth(createSyntheticOperationalTelemetry({ decisionLatencyMs: 30, dataFreshnessMs: 150 }));
      expect(health.status).toBe('healthy');
      expect(health.alarms).toHaveLength(0);
    });

    it('detects data staleness when freshness drift exceeds threshold', () => {
      const health = evaluateTelemetryHealth(createSyntheticOperationalTelemetry({ dataFreshnessMs: 5500 }));
      expect(health.status).toBe('critical');
      expect(health.alarms).toContain('STALE_DATA');
    });
  });
});
