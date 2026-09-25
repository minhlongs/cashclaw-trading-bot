import { describe, expect, it } from 'vitest';
import type {
  AlphaDecisionRecord,
  FeatureSnapshotHash,
  OperationalTelemetry,
  ShadowFill,
  ShadowOrder,
} from '../../../../tree/alpha/observability/types';
import { RegimeLabel } from '../../../../tree/regime/types';
import { evaluateObservability } from '../evaluate';
import { ObservabilityAlarmSchema, ObservabilityReportSchema } from '../schemas';

const HASH = 'c'.repeat(64) as FeatureSnapshotHash;

function makeMinimalReport() {
  return {
    reportId: 'rep-test-1',
    generatedAt: 1727250000000,
    timeRange: { start: 1727240000000, end: 1727250000000 },
    sampleCounts: { alphaDecisions: 0, portfolioDecisions: 0, shadowOrders: 0, shadowFills: 0, operationalTelemetry: 0 },
    edgeAttribution: { expectedNetReturnMean: 0, realizedNetReturnMean: 0, edgeDeltaMean: 0, edgeErosionBps: 0, byAlpha: {}, byRegime: {} },
    slippageAttribution: {
      expectedSlippageBpsMean: 0, realizedSlippageBpsMean: 0, slippageDeltaBpsMean: 0, totalFees: 0, effectiveCostBps: 0, byStressTier: {},
      bySide: { buy: { orderCount: 0, fillCount: 0, realizedSlippageBpsMean: 0 }, sell: { orderCount: 0, fillCount: 0, realizedSlippageBpsMean: 0 } },
    },
    portfolioDiagnostics: { meanGrossExposure: 0, meanNetExposure: 0, meanVolTargetingScale: 0, totalTurnover: 0, activeRiskOverlayTriggers: {} },
    operationalDiagnostics: {
      latency: { count: 0, meanMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0 },
      freshness: { count: 0, meanDriftMs: 0, medianDriftMs: 0, p95DriftMs: 0, maxDriftMs: 0, staleCount: 0 },
      provenance: { totalAttempts: 0, primarySuccessCount: 0, primarySuccessRate: 1, fallbackCount: 0, fallbackRate: 0, byProvider: {} },
    },
    systemHealth: {
      overallStatus: 'HEALTHY' as const, alarms: [],
      alarmCounts: { staleData: 0, highLatency: 0, providerFallback: 0, adverseSlippage: 0, edgeErosion: 0, unmatchedOrder: 0 },
    },
    featureSnapshotProvenance: { uniqueHashCount: 0, featureDependencies: [] },
  };
}

describe('Adversarial Anti-Injection Stress Tests', () => {
  const ROGUE_KEYS = ['executeLive', 'placeOrder', 'apiKey', 'transitionStrategy', 'cancelOrder'];

  it.each(ROGUE_KEYS)('rejects top-level rogue key %s with fail-closed ZodError', (key) => {
    const malicious = { ...makeMinimalReport(), [key]: 'rogue-val' };
    expect(() => ObservabilityReportSchema.parse(malicious)).toThrow(/unrecognized_keys/i);
  });

  it('rejects nested injection across all major report sub-sections', () => {
    const base = makeMinimalReport();
    const targets = [
      () => ({ ...base, timeRange: { ...base.timeRange, executeLive: true } }),
      () => ({ ...base, sampleCounts: { ...base.sampleCounts, placeOrder: true } }),
      () => ({ ...base, edgeAttribution: { ...base.edgeAttribution, apiKey: 'secret' } }),
      () => ({ ...base, slippageAttribution: { ...base.slippageAttribution, executeLive: true } }),
      () => ({ ...base, portfolioDiagnostics: { ...base.portfolioDiagnostics, placeOrder: true } }),
      () => ({ ...base, operationalDiagnostics: { ...base.operationalDiagnostics, apiKey: 'secret' } }),
      () => ({ ...base, systemHealth: { ...base.systemHealth, executeLive: true } }),
      () => ({ ...base, featureSnapshotProvenance: { ...base.featureSnapshotProvenance, placeOrder: true } }),
    ];
    for (const mutate of targets) {
      expect(() => ObservabilityReportSchema.parse(mutate())).toThrow(/unrecognized_keys/i);
    }
  });

  it('rejects rogue keys in ObservabilityAlarmSchema directly', () => {
    const alarm = { id: 'alarm-01', type: 'STALE_DATA' as const, severity: 'WARN' as const, message: 'test', timestamp: 1000 };
    for (const key of ROGUE_KEYS) {
      expect(() => ObservabilityAlarmSchema.parse({ ...alarm, [key]: true })).toThrow(/unrecognized_keys/i);
    }
  });
});

describe('Adversarial Alarm State Machine Transitions', () => {
  function makeTelem(drift: number, lat: number, fallback = false): OperationalTelemetry {
    return {
      decisionLatencyMs: lat, dataFreshnessMs: drift, timestamp: 1000,
      providerProvenance: {
        primaryProvider: 'binance', activeProvider: fallback ? 'bybit' : 'binance',
        usedFallback: fallback, fallbackAttempts: fallback ? 1 : 0,
      },
    };
  }

  function makeDecision(expRet = 0.05, expCost = 0.001): AlphaDecisionRecord {
    return {
      alphaId: 'a1', direction: 'buy', confidence: 0.9, expectedReturn: expRet,
      expectedCost: expCost, expectedTurnover: 0.1, regime: RegimeLabel.TREND_UP,
      horizon: '1h', featureDependencies: ['f1'], featureSnapshotHash: HASH, timestamp: 1000,
    };
  }

  it('proves HEALTHY -> DEGRADED transitions on each single warning alarm', () => {
    const base = { alphaDecisions: [], portfolioDecisions: [], shadowOrders: [], shadowFills: [], operationalTelemetry: [] };

    // 1. STALE_DATA warning
    const r1 = evaluateObservability({ ...base, operationalTelemetry: [makeTelem(2500, 20)] });
    expect(r1.systemHealth.overallStatus).toBe('DEGRADED');
    expect(r1.systemHealth.alarmCounts.staleData).toBe(1);

    // 2. HIGH_LATENCY warning
    const r2 = evaluateObservability({ ...base, operationalTelemetry: [makeTelem(50, 150)], config: { latencyCriticalThresholdMs: 500, latencyWarnThresholdMs: 100 } });
    expect(r2.systemHealth.overallStatus).toBe('DEGRADED');
    expect(r2.systemHealth.alarmCounts.highLatency).toBe(1);

    // 3. PROVIDER_FALLBACK warning (1 fallback out of 100 -> rate 0.01 <= budget 0.05)
    const telemFb: OperationalTelemetry[] = [makeTelem(50, 20, true)];
    for (let i = 0; i < 99; i++) telemFb.push(makeTelem(50, 20, false));
    const r3 = evaluateObservability({ ...base, operationalTelemetry: telemFb, config: { fallbackErrorBudgetPct: 0.05 } });
    expect(r3.systemHealth.overallStatus).toBe('DEGRADED');
    expect(r3.systemHealth.alarmCounts.providerFallback).toBe(1);

    // 4. ADVERSE_SLIPPAGE warning (slipDelta = 12 bps, warn = 10, crit = 20)
    const ord: ShadowOrder = { orderId: 'o1', symbol: 'BTC', side: 'buy', size: 1, price: 100, targetWeightDelta: 0.1, decisionTimestamp: 1000 };
    const fillWarn: ShadowFill = { fillId: 'f1', orderId: 'o1', symbol: 'BTC', side: 'buy', fillPrice: 100, fillQuantity: 1, fillTimestamp: 1010, feeAmount: 0, slippageBps: 15, stressTier: 'normal' };
    const r4 = evaluateObservability({ ...base, shadowOrders: [ord], shadowFills: [fillWarn], config: { slippageWarnThresholdBps: 10 } });
    expect(r4.systemHealth.overallStatus).toBe('DEGRADED');
    expect(r4.systemHealth.alarmCounts.adverseSlippage).toBe(1);

    // 5. EDGE_EROSION warning (erosion = 30 bps, warn = 25, crit = 50)
    const dec = makeDecision(0.04, 0.001); // expNet = 0.0390
    const r5 = evaluateObservability({ ...base, alphaDecisions: [dec], realizedReturns: { 'a1:1000': 0.0360 }, config: { edgeErosionWarnThresholdBps: 25, edgeErosionCriticalThresholdBps: 50 } });
    expect(r5.systemHealth.overallStatus).toBe('DEGRADED');
    expect(r5.systemHealth.alarmCounts.edgeErosion).toBe(1);

    // 6. UNMATCHED_ORDER warning (unfilled order)
    const r6 = evaluateObservability({ ...base, shadowOrders: [ord] });
    expect(r6.systemHealth.overallStatus).toBe('DEGRADED');
    expect(r6.systemHealth.alarmCounts.unmatchedOrder).toBe(1);
  });

  it('proves DEGRADED -> CRITICAL transitions when any critical alarm fires', () => {
    const baseOrd: ShadowOrder = { orderId: 'o1', symbol: 'BTC', side: 'buy', size: 1, price: 100, targetWeightDelta: 0.1, decisionTimestamp: 1000 };
    const degradedBase = {
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: [baseOrd], shadowFills: [],
      operationalTelemetry: [makeTelem(2500, 20)],
    };

    // Escalate with CRITICAL stale data
    const c1 = evaluateObservability({ ...degradedBase, operationalTelemetry: [makeTelem(6000, 20)] });
    expect(c1.systemHealth.overallStatus).toBe('CRITICAL');

    // Escalate with CRITICAL latency
    const c2 = evaluateObservability({ ...degradedBase, operationalTelemetry: [makeTelem(100, 600)], config: { latencyCriticalThresholdMs: 500 } });
    expect(c2.systemHealth.overallStatus).toBe('CRITICAL');

    // Escalate with CRITICAL fallback (fallback rate 100% > budget 5%)
    const c3 = evaluateObservability({ ...degradedBase, operationalTelemetry: [makeTelem(100, 20, true)], config: { fallbackErrorBudgetPct: 0.05 } });
    expect(c3.systemHealth.overallStatus).toBe('CRITICAL');

    // Escalate with CRITICAL unmatched fill (ghost fill)
    const ghostFill: ShadowFill = { fillId: 'f-ghost', orderId: 'ghost-ord', symbol: 'BTC', side: 'buy', fillPrice: 100, fillQuantity: 1, fillTimestamp: 1010, feeAmount: 0, slippageBps: 3, stressTier: 'normal' };
    const c4 = evaluateObservability({ ...degradedBase, shadowFills: [ghostFill] });
    expect(c4.systemHealth.overallStatus).toBe('CRITICAL');
  });
});
