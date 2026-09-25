import { describe, expect, it } from 'vitest';
import { RegimeLabel } from '../../../regime/types';
import {
  computeBatchEdgeAttribution,
  computeBatchSlippageAttribution,
  computeEdgeAttribution,
  computeSlippageAttribution,
  evaluateOperationalTelemetry,
  evaluateOperationalTelemetryBatch,
} from '../attribution';
import type { OperationalTelemetry, ShadowFill } from '../types';

const createFill = (overrides: Partial<ShadowFill> = {}): ShadowFill => ({
  fillId: 'fill-1', orderId: 'ord-1', symbol: 'BTC/USDT', side: 'buy',
  fillPrice: 50000, fillQuantity: 0.2, fillTimestamp: 1050, feeAmount: 8,
  slippageBps: 8.0, stressTier: 'normal', ...overrides,
});

const createTelemetry = (overrides: Partial<OperationalTelemetry> = {}): OperationalTelemetry => ({
  decisionLatencyMs: 45, dataFreshnessMs: 120,
  providerProvenance: { primaryProvider: 'binance', activeProvider: 'binance', usedFallback: false, fallbackAttempts: 0 },
  ...overrides,
});

describe('Attribution Analytics (Master Mission §14 / Requirement R3)', () => {
  describe('Edge Attribution Math', () => {
    it('computes exact delta edge against known fixture (0.02 expected net vs 0.015 realized net)', () => {
      const res = computeEdgeAttribution({ expectedReturn: 0.025, expectedCost: 0.005, realizedNetReturn: 0.015 });
      expect(res.expectedNetReturn).toBe(0.02);
      expect(res.realizedNetReturn).toBe(0.015);
      expect(res.deltaEdge).toBe(-0.005);
    });

    it('computes mark-to-market net return and fees for buy side', () => {
      const res = computeEdgeAttribution({
        expectedReturn: 0.05, expectedCost: 0.01, entryPrice: 100, exitPrice: 105,
        side: 'buy', feeAmount: 10, fillNotional: 10000,
      });
      expect(res.expectedNetReturn).toBe(0.04);
      expect(res.realizedNetReturn).toBe(0.049); // 5% gross - 0.1% fee
      expect(res.deltaEdge).toBe(0.009);
    });

    it('computes mark-to-market net return for sell side with feePct', () => {
      const res = computeEdgeAttribution({
        expectedReturn: 0.08, expectedCost: 0.01, entryPrice: 100, exitPrice: 90,
        side: 'sell', feePct: 0.002,
      });
      expect(res.expectedNetReturn).toBe(0.07);
      expect(res.realizedNetReturn).toBe(0.098); // 10% gross - 0.2% fee
      expect(res.deltaEdge).toBe(0.028);
    });

    it('aggregates batch edge attribution by alphaId and regime', () => {
      const batch = computeBatchEdgeAttribution([
        { alphaId: 'alpha-a', regime: RegimeLabel.TREND_UP, expectedReturn: 0.03, expectedCost: 0.01, realizedNetReturn: 0.025 },
        { alphaId: 'alpha-a', regime: RegimeLabel.TREND_UP, expectedReturn: 0.03, expectedCost: 0.01, realizedNetReturn: 0.015 },
        { alphaId: 'alpha-b', regime: RegimeLabel.RANGE, expectedReturn: 0.02, expectedCost: 0.005, realizedNetReturn: 0.010 },
      ]);
      expect(batch.count).toBe(3);
      expect(batch.byAlphaId['alpha-a'].count).toBe(2);
      expect(batch.byAlphaId['alpha-a'].meanDeltaEdge).toBe(0); // (+0.005 + -0.005) / 2
      expect(batch.byAlphaId['alpha-b'].meanDeltaEdge).toBe(-0.005);
      expect(batch.byRegime[RegimeLabel.TREND_UP].count).toBe(2);
      expect(batch.byRegime[RegimeLabel.RANGE].count).toBe(1);
    });

    it('handles empty batch gracefully and throws on missing required return inputs', () => {
      expect(computeBatchEdgeAttribution([]).count).toBe(0);
      expect(() => computeEdgeAttribution({} as unknown as { expectedReturn: number })).toThrow(/expectedReturn is required/);
      expect(() => computeEdgeAttribution({ expectedReturn: 0.02 })).toThrow(/Must provide realizedNetReturn/);
    });
  });

  describe('Slippage Attribution Math', () => {
    it('computes exact delta slippage for NORMAL tier fixture (expected 3.0 bps vs fill 8.0 bps -> +5.0 bps)', () => {
      const res = computeSlippageAttribution(createFill({ stressTier: 'normal', slippageBps: 8.0 }));
      expect(res.expectedSlippageBps).toBe(3.0);
      expect(res.realizedSlippageBps).toBe(8.0);
      expect(res.deltaSlippageBps).toBe(5.0);
    });

    it('computes exact expected slippage across conservative, adverse, and extreme stress tiers', () => {
      expect(computeSlippageAttribution(createFill({ stressTier: 'conservative', slippageBps: 7.0 })).deltaSlippageBps).toBe(0);
      expect(computeSlippageAttribution(createFill({ stressTier: 'adverse', slippageBps: 25.0 })).deltaSlippageBps).toBe(5.0);
      expect(computeSlippageAttribution(createFill({ stressTier: 'extreme', slippageBps: 38.0 })).deltaSlippageBps).toBe(-2.0);
    });

    it('supports expectedSlippageBpsOverride parameter', () => {
      const res = computeSlippageAttribution(createFill({ slippageBps: 12.5 }), 10.0);
      expect(res.expectedSlippageBps).toBe(10.0);
      expect(res.deltaSlippageBps).toBe(2.5);
    });

    it('aggregates batch slippage attribution overall, by stressTier, and by side', () => {
      const fills = [
        createFill({ fillId: 'f1', side: 'buy', stressTier: 'normal', slippageBps: 5.0 }), // exp 3.0, delta +2.0
        createFill({ fillId: 'f2', side: 'buy', stressTier: 'normal', slippageBps: 1.0 }), // exp 3.0, delta -2.0
        createFill({ fillId: 'f3', side: 'sell', stressTier: 'adverse', slippageBps: 22.0 }), // exp 20.0, delta +2.0
      ];
      const batch = computeBatchSlippageAttribution(fills);
      expect(batch.count).toBe(3);
      expect(batch.byStressTier.normal.count).toBe(2);
      expect(batch.byStressTier.normal.meanDeltaSlippageBps).toBe(0);
      expect(batch.byStressTier.adverse.meanDeltaSlippageBps).toBe(2.0);
      expect(batch.bySide.buy.count).toBe(2);
      expect(batch.bySide.sell.count).toBe(1);
    });
  });

  describe('Operational Telemetry Evaluation & Alarms', () => {
    it('calculates latency and freshness distribution statistics (count, mean, median, p95, max)', () => {
      const telemetry = [
        createTelemetry({ decisionLatencyMs: 10, dataFreshnessMs: 100 }),
        createTelemetry({ decisionLatencyMs: 20, dataFreshnessMs: 200 }),
        createTelemetry({ decisionLatencyMs: 30, dataFreshnessMs: 300 }),
        createTelemetry({ decisionLatencyMs: 40, dataFreshnessMs: 400 }),
      ];
      const summary = evaluateOperationalTelemetryBatch(telemetry);
      expect(summary.latency.count).toBe(4);
      expect(summary.latency.mean).toBe(25);
      expect(summary.latency.median).toBe(25);
      expect(summary.latency.p95).toBe(40);
      expect(summary.latency.max).toBe(40);
      expect(summary.freshness.median).toBe(250);
      expect(summary.freshness.staleCount).toBe(0);
      expect(summary.alarms).toHaveLength(0);
    });

    it('flags STALE_DATA, HIGH_LATENCY, and PROVIDER_FALLBACK alarms with custom thresholds', () => {
      const telemetry = [
        createTelemetry({ decisionLatencyMs: 150, dataFreshnessMs: 6000 }), // both trigger default
        createTelemetry({ providerProvenance: { primaryProvider: 'binance', activeProvider: 'bybit', usedFallback: true, fallbackAttempts: 1 } }),
      ];
      const summary = evaluateOperationalTelemetryBatch(telemetry);
      expect(summary.alarmTypes).toContain('STALE_DATA');
      expect(summary.alarmTypes).toContain('HIGH_LATENCY');
      expect(summary.alarmTypes).toContain('PROVIDER_FALLBACK');
      expect(summary.freshness.staleCount).toBe(1);
    });

    it('summarizes provider provenance: totalAttempts, primarySuccessRate, fallbackRate, byProvider', () => {
      const telemetry = [
        createTelemetry({ providerProvenance: { primaryProvider: 'binance', activeProvider: 'binance', usedFallback: false, fallbackAttempts: 0, providerLatencyMs: 20 } }),
        createTelemetry({ providerProvenance: { primaryProvider: 'binance', activeProvider: 'bybit', usedFallback: true, fallbackAttempts: 2, providerLatencyMs: 50 } }),
      ];
      const summary = evaluateOperationalTelemetryBatch(telemetry);
      expect(summary.provenance.totalAttempts).toBe(2);
      expect(summary.provenance.primarySuccessCount).toBe(1);
      expect(summary.provenance.primarySuccessRate).toBe(0.5);
      expect(summary.provenance.fallbackCount).toBe(1);
      expect(summary.provenance.fallbackRate).toBe(0.5);
      expect(summary.provenance.byProvider.binance.attempts).toBe(1);
      expect(summary.provenance.byProvider.bybit.attempts).toBe(2);
      expect(summary.provenance.byProvider.bybit.avgLatencyMs).toBe(50);
    });

    it('handles single telemetry item helper evaluateOperationalTelemetry and empty batch', () => {
      const single = evaluateOperationalTelemetry(createTelemetry({ decisionLatencyMs: 30 }));
      expect(single.count).toBe(1);
      expect(single.latency.mean).toBe(30);

      const empty = evaluateOperationalTelemetryBatch([]);
      expect(empty.count).toBe(0);
      expect(empty.latency.mean).toBe(0);
      expect(empty.provenance.primarySuccessRate).toBe(1);
    });
  });
});
