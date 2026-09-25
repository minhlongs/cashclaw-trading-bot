import { describe, expect, it } from 'vitest';
import {
  AlphaDecisionRecordSchema,
  FeatureSnapshotHashSchema,
  computeFeatureSnapshotHashSync,
} from '@/tree/alpha/observability';
import {
  computeAttribution,
  createSyntheticAlphaDecision,
  createSyntheticOperationalTelemetry,
  createSyntheticPortfolioDecision,
  evaluateTelemetryHealth,
  generateShadowOrder,
  simulateShadowFill,
} from './harness';

describe('Tier 2: Boundary & Corner Cases (F1-F5)', () => {
  describe('F1: Boundary & Invariant Checks', () => {
    it('rejects AlphaDecisionRecord with confidence out of bounds (> 1.0 or < 0)', () => {
      expect(() => createSyntheticAlphaDecision({ confidence: 1.05 })).toThrow();
      expect(() => createSyntheticAlphaDecision({ confidence: -0.01 })).toThrow();
    });

    it('rejects injected unauthorized trading fields via .strict() enforcement', () => {
      const payload = { ...createSyntheticAlphaDecision(), executeLive: true, sendToExchange: true };
      expect(() => AlphaDecisionRecordSchema.parse(payload)).toThrow();
    });

    it('accepts exact boundary values for confidence (0.0 and 1.0)', () => {
      expect(createSyntheticAlphaDecision({ confidence: 0.0 }).confidence).toBe(0);
      expect(createSyntheticAlphaDecision({ confidence: 1.0 }).confidence).toBe(1);
    });

    it('accepts 100% net short exposure (-1.0) with valid gross exposure', () => {
      const port = createSyntheticPortfolioDecision({ targetWeights: { 'BTC/USDT': -1.0 }, grossExposure: 1.0, netExposure: -1.0 });
      expect(port.netExposure).toBe(-1.0);
    });

    it('rejects negative decision latency or freshness drift in telemetry', () => {
      expect(() => createSyntheticOperationalTelemetry({ decisionLatencyMs: -1 })).toThrow();
      expect(() => createSyntheticOperationalTelemetry({ dataFreshnessMs: -10 })).toThrow();
    });
  });

  describe('F2: Snapshot Hashing Corners', () => {
    it('hashes empty feature object deterministically to 64-char hex', () => {
      const h1 = computeFeatureSnapshotHashSync({});
      expect(h1).toMatch(/^[a-f0-9]{64}$/);
      expect(h1).toBe(computeFeatureSnapshotHashSync({}));
    });

    it('safely handles circular object references without crashing', () => {
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;
      expect(() => computeFeatureSnapshotHashSync(circular)).not.toThrow();
    });

    it('distinguishes float precision boundaries', () => {
      const h1 = computeFeatureSnapshotHashSync({ val: 1.0 });
      const h2 = computeFeatureSnapshotHashSync({ val: 1.000000000000001 });
      expect(h1).not.toBe(h2);
    });

    it('handles deeply nested feature hierarchies (6 levels deep)', () => {
      const nested = { l1: { l2: { l3: { l4: { l5: { l6: 'deep' } } } } } };
      expect(computeFeatureSnapshotHashSync(nested)).toMatch(/^[a-f0-9]{64}$/);
    });

    it('rejects non-hex or malformed FeatureSnapshotHash strings', () => {
      expect(() => FeatureSnapshotHashSchema.parse('not-a-hash')).toThrow();
      expect(() => FeatureSnapshotHashSchema.parse('Z'.repeat(64))).toThrow();
    });
  });

  describe('F3: Shadow Order Generation Boundaries', () => {
    it('suppresses microscopic weight delta below epsilon (1e-7) returning null', () => {
      const order = generateShadowOrder({ orderId: 'o-micro', symbol: 'BTC/USDT', deltaW: 1e-7, price: 50000, equity: 100000, timestamp: 1000 });
      expect(order).toBeNull();
    });

    it('handles 100% liquidation delta (-1.0) generating full exit sell order', () => {
      const order = generateShadowOrder({ orderId: 'o-liq', symbol: 'BTC/USDT', deltaW: -1.0, price: 50000, equity: 100000, timestamp: 1000 })!;
      expect(order.side).toBe('sell');
      expect(order.size).toBe(100000);
    });

    it('handles small micro-penny prices with valid quantity precision', () => {
      const order = generateShadowOrder({ orderId: 'o-micro', symbol: 'MEME/USDT', deltaW: 0.1, price: 0.00005, equity: 10000, timestamp: 1000 })!;
      expect(order.size).toBe(1000);
      expect(order.price).toBe(0.00005);
    });

    it('rejects negative equity or zero reference prices fail-closed', () => {
      expect(generateShadowOrder({ orderId: 'o-bad', symbol: 'BTC/USDT', deltaW: 0.1, price: 0, equity: 10000, timestamp: 1000 })).toBeNull();
      expect(generateShadowOrder({ orderId: 'o-bad2', symbol: 'BTC/USDT', deltaW: 0.1, price: 100, equity: -5000, timestamp: 1000 })).toBeNull();
    });

    it('handles multi-symbol portfolio rebalance with mixed deltas', () => {
      const d1 = generateShadowOrder({ orderId: 'o-b', symbol: 'BTC/USDT', deltaW: 0.5, price: 50000, equity: 100000, timestamp: 1000 });
      const d2 = generateShadowOrder({ orderId: 'o-e', symbol: 'ETH/USDT', deltaW: -0.5, price: 3000, equity: 100000, timestamp: 1000 });
      const d3 = generateShadowOrder({ orderId: 'o-s', symbol: 'SOL/USDT', deltaW: 0, price: 100, equity: 100000, timestamp: 1000 });
      expect(d1?.side).toBe('buy');
      expect(d2?.side).toBe('sell');
      expect(d3).toBeNull();
    });
  });

  describe('F4: Shadow Fill Simulator Boundaries', () => {
    const order = generateShadowOrder({ orderId: 'o-bound', symbol: 'BTC/USDT', deltaW: 0.1, price: 50000, equity: 100000, timestamp: 1000 })!;

    it('handles zero latency execution where fillTimestamp equals decisionTimestamp', () => {
      const fill = simulateShadowFill({ order, arrivalPrice: 50000, latencyMs: 0, stressTier: 'normal' });
      expect(fill.fillTimestamp).toBe(1000);
    });

    it('handles high latency execution preserving causal addition', () => {
      const fill = simulateShadowFill({ order, arrivalPrice: 50000, latencyMs: 60000, stressTier: 'normal' });
      expect(fill.fillTimestamp).toBe(61000);
    });

    it('computes pure spread/impact slippage when arrival price equals decision price', () => {
      const fill = simulateShadowFill({ order, arrivalPrice: 50000, latencyMs: 10, stressTier: 'normal' });
      expect(fill.slippageBps).toBe(8); // (50040 - 50000) / 50000 * 10000 = 8 bps
    });

    it('simulates extreme adverse price gap (10% flash shock on buy)', () => {
      const fill = simulateShadowFill({ order, arrivalPrice: 55000, latencyMs: 100, stressTier: 'extreme' });
      expect(fill.fillPrice).toBe(55467.5); // 55000 * 1.0085
      expect(fill.slippageBps).toBeGreaterThan(1000);
    });

    it('validates precision and nonnegativity on fractional fee amounts', () => {
      const fill = simulateShadowFill({ order, arrivalPrice: 50000, latencyMs: 10, stressTier: 'extreme' });
      expect(fill.feeAmount).toBeGreaterThan(0);
      expect(Number.isFinite(fill.feeAmount)).toBe(true);
    });
  });

  describe('F5: Attribution & Diagnostics Boundaries', () => {
    it('freshness drift > 5000ms triggers STALE_DATA and critical status', () => {
      const tel = createSyntheticOperationalTelemetry({ dataFreshnessMs: 5001 });
      const res = evaluateTelemetryHealth(tel);
      expect(res.status).toBe('critical');
      expect(res.alarms).toContain('STALE_DATA');
    });

    it('exactly 5000ms freshness drift does NOT trigger stale alarm', () => {
      const tel = createSyntheticOperationalTelemetry({ dataFreshnessMs: 5000 });
      const res = evaluateTelemetryHealth(tel);
      expect(res.alarms).not.toContain('STALE_DATA');
    });

    it('circuit breaker degraded or open triggers CIRCUIT_DEGRADED and degraded status', () => {
      const tel = createSyntheticOperationalTelemetry({ providerProvenance: { primaryProvider: 'p1', activeProvider: 'p1', usedFallback: false, fallbackAttempts: 0, circuitState: 'degraded' } });
      const res = evaluateTelemetryHealth(tel);
      expect(res.status).toBe('degraded');
      expect(res.alarms).toContain('CIRCUIT_DEGRADED');
    });

    it('extreme slippage generates large negative ΔEdge and positive ΔSlippage', () => {
      const attr = computeAttribution({
        expectedReturn: 0.005, expectedCost: 0.001, realizedFillPrice: 51000, exitPrice: 50000,
        side: 'buy', feeAmount: 50, fillNotional: 10000, expectedSlippageBps: 10, realizedSlippageBps: 200,
      });
      expect(attr.deltaEdge).toBeLessThan(-0.02);
      expect(attr.deltaSlippageBps).toBe(190);
    });

    it('zero execution drag (realized identical to expected) produces zero ΔEdge', () => {
      const attr = computeAttribution({
        expectedReturn: 0.02, expectedCost: 0.005, realizedFillPrice: 50000, exitPrice: 51000,
        side: 'buy', feeAmount: 50, fillNotional: 10000, expectedSlippageBps: 10, realizedSlippageBps: 10,
      });
      expect(attr.deltaSlippageBps).toBe(0);
      expect(attr.expectedNetReturn).toBe(0.015);
      expect(attr.realizedNetReturn).toBe(0.015);
      expect(attr.deltaEdge).toBe(0);
    });
  });
});
