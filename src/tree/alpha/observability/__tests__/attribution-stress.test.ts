import { describe, expect, it } from 'vitest';
import { RegimeLabel } from '../../../regime/types';
import {
  computeBatchEdgeAttribution,
  computeBatchSlippageAttribution,
  evaluateOperationalTelemetryBatch,
  type EdgeAttributionParams,
} from '../attribution';
import type { CostStressTier, OperationalTelemetry, ShadowFill, ShadowOrderSide } from '../types';

describe('Attribution Stress & Aggregation Consistency (P8-M3)', () => {
  describe('Batch Edge Aggregation Across Multi-Alpha & Multi-Regime Scenarios', () => {
    it('verifies exact arithmetic mean invariance across 5 alphas and 4 regimes (250 records)', () => {
      const alphas = ['alpha-momentum', 'alpha-mean-rev', 'alpha-breakout', 'alpha-vol-carry', 'alpha-stat-arb'];
      const regimes = [RegimeLabel.TREND_UP, RegimeLabel.TREND_DOWN, RegimeLabel.RANGE, RegimeLabel.HIGH_VOLATILITY];
      const records: EdgeAttributionParams[] = [];

      let rawSumExpNet = 0;
      let rawSumRealNet = 0;
      let rawSumDelta = 0;

      for (let i = 0; i < 250; i++) {
        const alphaId = alphas[i % alphas.length];
        const regime = regimes[i % regimes.length];
        const expectedReturn = 0.01 + (i % 20) * 0.002;
        const expectedCost = 0.001 + (i % 5) * 0.0005;
        const expNet = Number((expectedReturn - expectedCost).toFixed(8));
        const realizedNetReturn = Number((expNet + ((i % 11) - 5) * 0.001).toFixed(8));
        const delta = Number((realizedNetReturn - expNet).toFixed(8));

        rawSumExpNet += expNet;
        rawSumRealNet += realizedNetReturn;
        rawSumDelta += delta;

        records.push({ alphaId, regime, expectedReturn, expectedCost, realizedNetReturn });
      }

      const res = computeBatchEdgeAttribution(records);
      expect(res.count).toBe(250);
      expect(res.meanExpectedNetReturn).toBeCloseTo(rawSumExpNet / 250, 6);
      expect(res.meanRealizedNetReturn).toBeCloseTo(rawSumRealNet / 250, 6);
      expect(res.meanDeltaEdge).toBeCloseTo(rawSumDelta / 250, 6);

      // Verify alpha-level partition and weighted mean reconstruction
      let reconstructedAlphaSum = 0;
      let totalAlphaCount = 0;
      for (const alphaId of alphas) {
        const summary = res.byAlphaId[alphaId];
        expect(summary).toBeDefined();
        expect(summary.count).toBe(50);
        totalAlphaCount += summary.count;
        reconstructedAlphaSum += summary.count * summary.meanDeltaEdge;
      }
      expect(totalAlphaCount).toBe(250);
      expect(reconstructedAlphaSum / 250).toBeCloseTo(res.meanDeltaEdge, 6);

      // Verify regime-level partition and weighted mean reconstruction
      let reconstructedRegimeSum = 0;
      let totalRegimeCount = 0;
      for (const regime of regimes) {
        const summary = res.byRegime[regime];
        expect(summary).toBeDefined();
        totalRegimeCount += summary.count;
        reconstructedRegimeSum += summary.count * summary.meanDeltaEdge;
      }
      expect(totalRegimeCount).toBe(250);
      expect(reconstructedRegimeSum / 250).toBeCloseTo(res.meanDeltaEdge, 6);
    });

    it('aggregates gracefully when alphaId and regime are omitted (unknown fallback)', () => {
      const records: EdgeAttributionParams[] = [
        { expectedReturn: 0.02, realizedNetReturn: 0.015 },
        { expectedReturn: 0.03, realizedNetReturn: 0.035 },
      ];
      const res = computeBatchEdgeAttribution(records);
      expect(res.count).toBe(2);
      expect(res.byAlphaId['unknown'].count).toBe(2);
      expect(res.byRegime['unknown'].count).toBe(2);
      expect(res.meanDeltaEdge).toBe(0);
    });
  });

  describe('Batch Slippage Aggregation Consistency (4 Tiers x 2 Sides)', () => {
    it('verifies partition and arithmetic means across balanced tier-side combinations (160 fills)', () => {
      const tiers: readonly CostStressTier[] = ['normal', 'conservative', 'adverse', 'extreme'];
      const sides: readonly ShadowOrderSide[] = ['buy', 'sell'];
      const fills: ShadowFill[] = [];

      let sumRealBps = 0;
      let sumExpBps = 0;
      const expectedByTier: Record<CostStressTier, number> = {
        normal: 3.0, conservative: 7.0, adverse: 20.0, extreme: 40.0,
      };

      let fillIdx = 0;
      for (const stressTier of tiers) {
        for (const side of sides) {
          // 20 fills per (tier, side) cell: 10 improved (-5 bps) and 10 adverse (+15 bps)
          for (let k = 0; k < 20; k++) {
            const delta = k < 10 ? -5.0 : 15.0;
            const slippageBps = expectedByTier[stressTier] + delta;
            sumRealBps += slippageBps;
            sumExpBps += expectedByTier[stressTier];

            fills.push({
              fillId: `fill-${fillIdx++}`, orderId: `ord-${fillIdx}`, symbol: 'SOL/USDT', side,
              fillPrice: 150, fillQuantity: 10, fillTimestamp: 1000 + fillIdx, feeAmount: 1.5,
              slippageBps, stressTier,
            });
          }
        }
      }

      const res = computeBatchSlippageAttribution(fills);
      expect(res.count).toBe(160);
      expect(res.meanRealizedSlippageBps).toBeCloseTo(sumRealBps / 160, 4);
      expect(res.meanExpectedSlippageBps).toBeCloseTo(sumExpBps / 160, 4);
      expect(res.meanDeltaSlippageBps).toBeCloseTo((sumRealBps - sumExpBps) / 160, 4);

      // Verify all 4 tiers present and partitioned (40 fills each, mean delta = +5.0 bps)
      for (const t of tiers) {
        expect(res.byStressTier[t].count).toBe(40);
        expect(res.byStressTier[t].meanDeltaSlippageBps).toBe(5.0);
      }

      // Verify both sides partitioned (80 fills each, mean delta = +5.0 bps)
      expect(res.bySide.buy.count).toBe(80);
      expect(res.bySide.sell.count).toBe(80);
      expect(res.bySide.buy.meanDeltaSlippageBps).toBe(5.0);
      expect(res.bySide.sell.meanDeltaSlippageBps).toBe(5.0);
    });
  });

  describe('Operational Telemetry Stress: Long-Tail Distribution & Alarms', () => {
    it('accurately computes p95, median, and flags alarms under skewed latency telemetry', () => {
      const records: OperationalTelemetry[] = [];
      // 94 records with latency = 20ms, drift = 50ms (healthy)
      for (let i = 0; i < 94; i++) {
        records.push({
          decisionLatencyMs: 20, dataFreshnessMs: 50, timestamp: 1000 + i,
          providerProvenance: { primaryProvider: 'binance', activeProvider: 'binance', usedFallback: false, fallbackAttempts: 0 },
        });
      }
      // 6 outlier records with latency = 250ms (alarm), drift = 8000ms (alarm), and fallback
      for (let i = 94; i < 100; i++) {
        records.push({
          decisionLatencyMs: 250, dataFreshnessMs: 8000, timestamp: 2000 + i,
          providerProvenance: { primaryProvider: 'binance', activeProvider: 'bybit', usedFallback: true, fallbackAttempts: 2, providerLatencyMs: 220 },
        });
      }

      const summary = evaluateOperationalTelemetryBatch(records);
      expect(summary.count).toBe(100);
      expect(summary.latency.median).toBe(20);
      expect(summary.latency.p95).toBe(250); // 95th percentile index 94 captures the 250ms spike
      expect(summary.latency.max).toBe(250);
      expect(summary.freshness.staleCount).toBe(6);

      // Alarms verification
      expect(summary.alarmTypes).toEqual(expect.arrayContaining(['STALE_DATA', 'HIGH_LATENCY', 'PROVIDER_FALLBACK']));
      expect(summary.alarms.filter((a) => a.type === 'HIGH_LATENCY')).toHaveLength(6);
      expect(summary.alarms.filter((a) => a.type === 'STALE_DATA')).toHaveLength(6);
      expect(summary.alarms.filter((a) => a.type === 'PROVIDER_FALLBACK')).toHaveLength(6);

      // Provenance rates
      expect(summary.provenance.primarySuccessCount).toBe(94);
      expect(summary.provenance.fallbackCount).toBe(6);
      expect(summary.provenance.primarySuccessRate).toBe(0.94);
      expect(summary.provenance.fallbackRate).toBe(0.06);
      expect(summary.provenance.byProvider.bybit.avgLatencyMs).toBe(220);
    });
  });
});
