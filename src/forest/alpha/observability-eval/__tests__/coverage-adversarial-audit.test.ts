import { describe, expect, it } from 'vitest';
import type {
  AlphaDecisionRecord,
  CostStressTier,
  OperationalTelemetry,
  PortfolioDecisionRecord,
  ShadowFill,
  ShadowOrder,
} from '../../../../tree/alpha/observability/types';
import { RegimeLabel } from '../../../../tree/regime/types';
import { computeEdgeDiagnostics } from '../edge-diagnostics';
import { evaluateObservability } from '../evaluate';
import { computeSlippageDiagnostics } from '../slippage-diagnostics';
import { computeOperationalDiagnostics, evaluateSystemHealth } from '../telemetry-diagnostics';

function mockDec(alphaId: string, ts: number, symbol?: string): AlphaDecisionRecord {
  return {
    alphaId, direction: 'buy', confidence: 0.9, expectedReturn: 0.05, expectedCost: 0.01,
    expectedTurnover: 0.1, regime: RegimeLabel.TREND_UP, horizon: '1h',
    featureDependencies: ['spread'], featureSnapshotHash: 'c'.repeat(64) as any,
    timestamp: ts, ...(symbol ? { symbol } : {}),
  };
}

describe('Coverage Hardening: Edge Diagnostics Branches', () => {
  it('covers Map and Record resolution paths including alphaId, symbol, fallback, and undefined symbol', () => {
    const d1 = mockDec('alpha-map-id', 1000, 'BTC/USDT');
    const d2 = mockDec('alpha-map-sym', 2000, 'ETH/USDT');
    const d3 = mockDec('alpha-map-miss', 3000, 'SOL/USDT');
    const d4 = mockDec('alpha-map-nosym', 4000);
    const mapReturns = new Map<string, number>([['alpha-map-id', 0.08], ['ETH/USDT', 0.06]]);
    const resMap = computeEdgeDiagnostics([d1, d2, d3, d4], mapReturns);
    expect(resMap.byAlpha['alpha-map-id']?.realizedNetReturnMean).toBe(0.08);
    expect(resMap.byAlpha['alpha-map-sym']?.realizedNetReturnMean).toBe(0.06);
    expect(resMap.byAlpha['alpha-map-miss']?.realizedNetReturnMean).toBe(0.04);
    expect(resMap.byAlpha['alpha-map-nosym']?.realizedNetReturnMean).toBe(0.04);

    const recReturns: Record<string, number> = { 'alpha-rec-id': 0.09, 'ADA/USDT': 0.07, 'alpha-comp:1000': 0.11 };
    const r1 = mockDec('alpha-comp', 1000, 'ADA/USDT');
    const r2 = mockDec('alpha-rec-id', 2000, 'XRP/USDT');
    const r3 = mockDec('alpha-rec-sym', 3000, 'ADA/USDT');
    const r4 = mockDec('alpha-rec-nosym', 4000);
    const resRec = computeEdgeDiagnostics([r1, r2, r3, r4], recReturns);
    expect(resRec.byAlpha['alpha-comp']?.realizedNetReturnMean).toBe(0.11);
    expect(resRec.byAlpha['alpha-rec-id']?.realizedNetReturnMean).toBe(0.09);
    expect(resRec.byAlpha['alpha-rec-sym']?.realizedNetReturnMean).toBe(0.07);
    expect(resRec.byAlpha['alpha-rec-nosym']?.realizedNetReturnMean).toBe(0.04);
  });

  it('covers empty alpha decisions and Sharpe edge cases (zero variance, count < 2)', () => {
    const emptyDiag = computeEdgeDiagnostics([]);
    expect(emptyDiag.expectedNetReturnMean).toBe(0);
    expect(emptyDiag.byAlpha).toEqual({});

    const single = [mockDec('alpha-single', 1000)];
    expect(computeEdgeDiagnostics(single, { 'alpha-single:1000': 0.05 }).byAlpha['alpha-single']?.sharpe).toBeNull();

    const identical = [mockDec('alpha-zv', 1000), mockDec('alpha-zv', 2000), mockDec('alpha-zv', 3000)];
    const resIdentical = computeEdgeDiagnostics(identical, { 'alpha-zv:1000': 0.05, 'alpha-zv:2000': 0.05, 'alpha-zv:3000': 0.05 });
    expect(resIdentical.byAlpha['alpha-zv']?.sharpe).toBeNull();
  });
});

describe('Coverage Hardening: Evaluate and Portfolio Diagnostics', () => {
  it('covers portfolio turnover undefined and operational telemetry undefined timestamp', () => {
    const pRecord: PortfolioDecisionRecord = {
      targetWeights: { 'BTC/USDT': 1.0 }, grossExposure: 1.0, netExposure: 1.0,
      volTargetingScale: 1.0, activeRiskOverlayAdjustments: ['overlay_1', 'overlay_1'], timestamp: 1000,
    };
    const telemWithoutTs: OperationalTelemetry = {
      decisionLatencyMs: 15, dataFreshnessMs: 50,
      providerProvenance: { primaryProvider: 'binance', activeProvider: 'binance', usedFallback: false, fallbackAttempts: 0 },
    };
    const report = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [pRecord], shadowOrders: [],
      shadowFills: [], operationalTelemetry: [telemWithoutTs],
    });
    expect(report.portfolioDiagnostics.totalTurnover).toBe(0);
    expect(report.portfolioDiagnostics.activeRiskOverlayTriggers['overlay_1']).toBe(2);
    expect(report.timeRange.start).toBe(report.timeRange.end);
  });
});

describe('Coverage Hardening: Telemetry & Alarms Boundaries', () => {
  it('covers telemetry alarm threshold branches and undefined timestamp fallback to now', () => {
    const now = Date.now();
    const tWarnStale: OperationalTelemetry = {
      decisionLatencyMs: 120, dataFreshnessMs: 2500,
      providerProvenance: { primaryProvider: 'binance', activeProvider: 'bybit', usedFallback: true, fallbackAttempts: 1, providerLatencyMs: 50 },
    };
    const tCritStale: OperationalTelemetry = {
      timestamp: now, decisionLatencyMs: 600, dataFreshnessMs: 6000,
      providerProvenance: { primaryProvider: 'binance', activeProvider: 'bybit', usedFallback: true, fallbackAttempts: 2 },
    };
    const opDiag = computeOperationalDiagnostics([tWarnStale, tCritStale], { stalenessWarnThresholdMs: 2000 });
    const health = evaluateSystemHealth([tWarnStale, tCritStale], opDiag, computeEdgeDiagnostics([]), computeSlippageDiagnostics([], []), [], [], {
      latencyWarnThresholdMs: 100, latencyCriticalThresholdMs: 500, fallbackErrorBudgetPct: 0.01,
    });
    expect(health.overallStatus).toBe('CRITICAL');
    expect(health.alarmCounts.staleData).toBe(2);
    expect(health.alarmCounts.highLatency).toBe(1);
    expect(health.alarmCounts.providerFallback).toBe(1);
  });

  it('covers warning-only alarms for latency, fallback, slippage, and edge erosion', () => {
    const tWarn: OperationalTelemetry = {
      timestamp: 1000, decisionLatencyMs: 150, dataFreshnessMs: 100,
      providerProvenance: { primaryProvider: 'binance', activeProvider: 'bybit', usedFallback: true, fallbackAttempts: 1 },
    };
    const tOk: OperationalTelemetry = {
      timestamp: 2000, decisionLatencyMs: 10, dataFreshnessMs: 100,
      providerProvenance: { primaryProvider: 'binance', activeProvider: 'binance', usedFallback: false, fallbackAttempts: 0 },
    };
    const opDiag = computeOperationalDiagnostics([tWarn, tOk]);
    const mockEdge = { expectedNetReturnMean: 0.05, realizedNetReturnMean: 0.02, edgeDeltaMean: -0.03, edgeErosionBps: 30, byAlpha: {}, byRegime: {} };
    const mockSlip = {
      expectedSlippageBpsMean: 5, realizedSlippageBpsMean: 20, slippageDeltaBpsMean: 15,
      totalFees: 10, effectiveCostBps: 22, byStressTier: {},
      bySide: { buy: { orderCount: 0, fillCount: 0, realizedSlippageBpsMean: 0 }, sell: { orderCount: 0, fillCount: 0, realizedSlippageBpsMean: 0 } },
    };
    const health = evaluateSystemHealth([tWarn, tOk], opDiag, mockEdge, mockSlip, [], [], {
      latencyWarnThresholdMs: 50, latencyCriticalThresholdMs: 1000,
      fallbackErrorBudgetPct: 0.9, slippageWarnThresholdBps: 10, edgeErosionWarnThresholdBps: 20, edgeErosionCriticalThresholdBps: 50,
    });
    expect(health.overallStatus).toBe('DEGRADED');
    expect(health.alarmCounts.highLatency).toBe(1);
    expect(health.alarmCounts.providerFallback).toBe(1);
    expect(health.alarmCounts.adverseSlippage).toBe(1);
    expect(health.alarmCounts.edgeErosion).toBe(1);
  });

  it('covers unmatched order (WARN) and unmatched fill (CRITICAL)', () => {
    const order: ShadowOrder = {
      orderId: 'ord-unmatched', symbol: 'BTC/USDT', side: 'buy', size: 1, price: 50000, targetWeightDelta: 0.1, decisionTimestamp: 1000,
    };
    const fill: ShadowFill = {
      fillId: 'fill-orphan', orderId: 'ord-nonexistent', symbol: 'BTC/USDT', side: 'buy',
      fillPrice: 50000, fillQuantity: 1, fillTimestamp: 1010, feeAmount: 1, slippageBps: 2, stressTier: 'normal',
    };
    const health = evaluateSystemHealth([], computeOperationalDiagnostics([]), computeEdgeDiagnostics([]), computeSlippageDiagnostics([], []), [order], [fill]);
    expect(health.overallStatus).toBe('CRITICAL');
    expect(health.alarmCounts.unmatchedOrder).toBe(2);
  });
});

describe('Coverage Hardening: Slippage Zero Notional & Percentiles', () => {
  it('covers zero notional in slippage and odd/even percentiles in operational telemetry', () => {
    const fillZeroNotional: ShadowFill = {
      fillId: 'f0', orderId: 'ord0', symbol: 'BTC/USDT', side: 'buy',
      fillPrice: 0, fillQuantity: 0, fillTimestamp: 1000, feeAmount: 0, slippageBps: 0,
      stressTier: 'extreme' as CostStressTier,
    };
    const slipResult = computeSlippageDiagnostics([], [fillZeroNotional]);
    expect(slipResult.effectiveCostBps).toBe(0);

    const oddTelem = [10, 20, 30].map((lat, i) => ({
      decisionLatencyMs: lat, dataFreshnessMs: lat * 2, timestamp: 1000 + i,
      providerProvenance: { primaryProvider: 'binance', activeProvider: 'binance', usedFallback: false, fallbackAttempts: 0 },
    }));
    expect(computeOperationalDiagnostics(oddTelem).latency.medianMs).toBe(20);

    const evenTelem = [10, 20, 30, 40].map((lat, i) => ({
      decisionLatencyMs: lat, dataFreshnessMs: lat * 2, timestamp: 1000 + i,
      providerProvenance: { primaryProvider: 'binance', activeProvider: 'binance', usedFallback: false, fallbackAttempts: 0 },
    }));
    expect(computeOperationalDiagnostics(evenTelem).latency.medianMs).toBe(25);
  });
});
