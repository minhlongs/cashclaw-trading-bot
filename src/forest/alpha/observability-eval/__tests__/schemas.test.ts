import { describe, expect, it } from 'vitest';
import { RegimeLabel } from '../../../../tree/regime/types';
import {
  AlphaEdgeAttributionSchema,
  FreshnessSummarySchema,
  LatencySummarySchema,
  ObservabilityAlarmSchema,
  ObservabilityAlarmSeveritySchema,
  ObservabilityAlarmTypeSchema,
  ObservabilityReportSchema,
  ProviderProvenanceSummarySchema,
  RegimeEdgeAttributionSchema,
  StressTierAttributionSchema,
} from '../schemas';

describe('Observability Eval Schemas & Strict Validation', () => {
  it('validates alarm types and severity enums', () => {
    const validTypes = ['STALE_DATA', 'HIGH_LATENCY', 'PROVIDER_FALLBACK', 'ADVERSE_SLIPPAGE', 'EDGE_EROSION', 'UNMATCHED_ORDER'];
    for (const t of validTypes) expect(ObservabilityAlarmTypeSchema.parse(t)).toBe(t);
    expect(() => ObservabilityAlarmTypeSchema.parse('INVALID_TYPE')).toThrow();

    for (const s of ['INFO', 'WARN', 'CRITICAL']) expect(ObservabilityAlarmSeveritySchema.parse(s)).toBe(s);
    expect(() => ObservabilityAlarmSeveritySchema.parse('FATAL')).toThrow();
  });

  it('validates ObservabilityAlarmSchema and rejects injection of execution commands', () => {
    const valid = {
      id: 'alarm-1',
      type: 'STALE_DATA',
      severity: 'WARN',
      message: 'Freshness drift high',
      timestamp: 1727250000000,
      metricValue: 2500,
      thresholdValue: 2000,
      context: { provider: 'binance' },
    };
    expect(ObservabilityAlarmSchema.parse(valid)).toEqual(valid);

    expect(() => ObservabilityAlarmSchema.parse({ ...valid, executeOrder: true })).toThrow(/unrecognized_keys/i);
    expect(() => ObservabilityAlarmSchema.parse({ ...valid, metricValue: NaN })).toThrow();
    expect(() => ObservabilityAlarmSchema.parse({ ...valid, timestamp: -1 })).toThrow();
  });

  it('validates LatencySummarySchema and FreshnessSummarySchema', () => {
    const lat = { count: 10, meanMs: 15.5, medianMs: 14, p95Ms: 25, maxMs: 30 };
    expect(LatencySummarySchema.parse(lat)).toEqual(lat);
    expect(() => LatencySummarySchema.parse({ ...lat, meanMs: -1 })).toThrow();
    expect(() => LatencySummarySchema.parse({ ...lat, extraField: 123 })).toThrow(/unrecognized_keys/i);

    const fresh = { count: 10, meanDriftMs: 40.2, medianDriftMs: 35, p95DriftMs: 80, maxDriftMs: 90, staleCount: 0 };
    expect(FreshnessSummarySchema.parse(fresh)).toEqual(fresh);
    expect(() => FreshnessSummarySchema.parse({ ...fresh, staleCount: -1 })).toThrow();
  });

  it('validates ProviderProvenanceSummarySchema', () => {
    const prov = {
      totalAttempts: 100,
      primarySuccessCount: 95,
      primarySuccessRate: 0.95,
      fallbackCount: 5,
      fallbackRate: 0.05,
      byProvider: { binance: { attempts: 100, successCount: 100, avgLatencyMs: 12.3 } },
    };
    expect(ProviderProvenanceSummarySchema.parse(prov)).toEqual(prov);
    expect(() => ProviderProvenanceSummarySchema.parse({ ...prov, primarySuccessRate: 1.5 })).toThrow();
    expect(() => ProviderProvenanceSummarySchema.parse({ ...prov, fallbackRate: -0.1 })).toThrow();
  });

  it('validates AlphaEdgeAttributionSchema and RegimeEdgeAttributionSchema', () => {
    const alphaAtt = {
      alphaId: 'alpha-momentum',
      decisionCount: 50,
      expectedNetReturnMean: 0.015,
      realizedNetReturnMean: 0.012,
      edgeDeltaMean: -0.003,
      winRate: 0.62,
      sharpe: 1.45,
    };
    expect(AlphaEdgeAttributionSchema.parse(alphaAtt)).toEqual(alphaAtt);
    expect(AlphaEdgeAttributionSchema.parse({ ...alphaAtt, sharpe: null }).sharpe).toBeNull();
    expect(() => AlphaEdgeAttributionSchema.parse({ ...alphaAtt, winRate: 1.2 })).toThrow();

    const regAtt = {
      regime: RegimeLabel.TREND_UP,
      decisionCount: 30,
      expectedNetReturnMean: 0.02,
      realizedNetReturnMean: 0.018,
      edgeDeltaMean: -0.002,
    };
    expect(RegimeEdgeAttributionSchema.parse(regAtt)).toEqual(regAtt);
    expect(() => RegimeEdgeAttributionSchema.parse({ ...regAtt, regime: 'INVALID_REGIME' })).toThrow();
  });

  it('validates StressTierAttributionSchema', () => {
    const tier = {
      stressTier: 'conservative',
      orderCount: 10,
      fillCount: 10,
      fillRate: 1.0,
      expectedSlippageBpsMean: 7.0,
      realizedSlippageBpsMean: 6.8,
      slippageDeltaBpsMean: -0.2,
      totalFees: 5.4,
    };
    expect(StressTierAttributionSchema.parse(tier)).toEqual(tier);
    expect(() => StressTierAttributionSchema.parse({ ...tier, totalFees: -1 })).toThrow();
    expect(() => StressTierAttributionSchema.parse({ ...tier, fillRate: 2.0 })).toThrow();
  });

  it('validates full ObservabilityReportSchema and fails closed on hostile injection', () => {
    const fullReport = {
      reportId: 'rep-1',
      generatedAt: 1727250000000,
      timeRange: { start: 1727240000000, end: 1727250000000 },
      sampleCounts: { alphaDecisions: 1, portfolioDecisions: 1, shadowOrders: 1, shadowFills: 1, operationalTelemetry: 1 },
      edgeAttribution: {
        expectedNetReturnMean: 0.01,
        realizedNetReturnMean: 0.008,
        edgeDeltaMean: -0.002,
        edgeErosionBps: 20,
        byAlpha: {},
        byRegime: {},
      },
      slippageAttribution: {
        expectedSlippageBpsMean: 3.0,
        realizedSlippageBpsMean: 3.2,
        slippageDeltaBpsMean: 0.2,
        totalFees: 1.5,
        effectiveCostBps: 4.7,
        byStressTier: {},
        bySide: {
          buy: { orderCount: 1, fillCount: 1, realizedSlippageBpsMean: 3.2 },
          sell: { orderCount: 0, fillCount: 0, realizedSlippageBpsMean: 0 },
        },
      },
      portfolioDiagnostics: {
        meanGrossExposure: 0.8,
        meanNetExposure: 0.4,
        meanVolTargetingScale: 1.0,
        totalTurnover: 0.2,
        activeRiskOverlayTriggers: { max_drawdown_stop: 1 },
      },
      operationalDiagnostics: {
        latency: { count: 1, meanMs: 10, medianMs: 10, p95Ms: 10, maxMs: 10 },
        freshness: { count: 1, meanDriftMs: 25, medianDriftMs: 25, p95DriftMs: 25, maxDriftMs: 25, staleCount: 0 },
        provenance: { totalAttempts: 1, primarySuccessCount: 1, primarySuccessRate: 1, fallbackCount: 0, fallbackRate: 0, byProvider: {} },
      },
      systemHealth: {
        overallStatus: 'HEALTHY',
        alarms: [],
        alarmCounts: { staleData: 0, highLatency: 0, providerFallback: 0, adverseSlippage: 0, edgeErosion: 0, unmatchedOrder: 0 },
      },
      featureSnapshotProvenance: {
        uniqueHashCount: 1,
        featureDependencies: ['spread', 'volume'],
      },
    };

    expect(ObservabilityReportSchema.parse(fullReport)).toEqual(fullReport);

    const injected = {
      ...fullReport,
      placeOrder: true,
      apiKey: 'binance-sec',
      executeTrade: { symbol: 'BTC/USDT', side: 'buy' },
    };
    expect(() => ObservabilityReportSchema.parse(injected)).toThrow(/unrecognized_keys/i);
  });
});
