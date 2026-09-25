import { describe, expect, it } from 'vitest';
import type {
  AlphaDecisionRecord,
  CostStressTier,
  FeatureSnapshotHash,
  OperationalTelemetry,
  PortfolioDecisionRecord,
  ShadowFill,
  ShadowOrder,
} from '../../../../tree/alpha/observability/types';
import { RegimeLabel } from '../../../../tree/regime/types';
import { evaluateObservability } from '../evaluate';
import { ObservabilityReportSchema } from '../schemas';

const HASH_A = 'a'.repeat(64) as FeatureSnapshotHash;
const HASH_B = 'b'.repeat(64) as FeatureSnapshotHash;

function makeDecision(alphaId: string, ts: number, expRet = 0.02, expCost = 0.002, regime = RegimeLabel.TREND_UP): AlphaDecisionRecord {
  return {
    alphaId, direction: 'buy', confidence: 0.8, expectedReturn: expRet, expectedCost: expCost,
    expectedTurnover: 0.1, regime, horizon: '1h', featureDependencies: ['spread', 'volatility'],
    featureSnapshotHash: alphaId === 'alpha-1' ? HASH_A : HASH_B, timestamp: ts, symbol: 'BTC/USDT',
  };
}

function makeOrder(id: string, side: 'buy' | 'sell', ts: number): ShadowOrder {
  return { orderId: id, symbol: 'BTC/USDT', side, size: 1.0, price: 50000, targetWeightDelta: 0.1, decisionTimestamp: ts };
}

function makeFill(id: string, orderId: string, side: 'buy' | 'sell', ts: number, tier: CostStressTier = 'normal', fee = 1.0, slip = 3.0): ShadowFill {
  return { fillId: id, orderId, symbol: 'BTC/USDT', side, fillPrice: 50000, fillQuantity: 1.0, fillTimestamp: ts + 10, feeAmount: fee, slippageBps: slip, stressTier: tier };
}

function makeTelem(ts: number, lat = 20, fresh = 50, fallback = false): OperationalTelemetry {
  return {
    decisionLatencyMs: lat, dataFreshnessMs: fresh, timestamp: ts,
    providerProvenance: { primaryProvider: 'binance', activeProvider: fallback ? 'bybit' : 'binance', usedFallback: fallback, fallbackAttempts: fallback ? 1 : 0, providerLatencyMs: 15 },
  };
}

describe('evaluateObservability Seam', () => {
  it('handles empty input streams gracefully and returns HEALTHY status', () => {
    const report = evaluateObservability({ alphaDecisions: [], portfolioDecisions: [], shadowOrders: [], shadowFills: [], operationalTelemetry: [] });
    expect(ObservabilityReportSchema.parse(report)).toBeDefined();
    expect(report.sampleCounts.alphaDecisions).toBe(0);
    expect(report.systemHealth.overallStatus).toBe('HEALTHY');
    expect(report.systemHealth.alarms).toHaveLength(0);
    expect(report.featureSnapshotProvenance.uniqueHashCount).toBe(0);
  });

  it('aggregates synthetic streams with accurate math across dimensions', () => {
    const d1 = makeDecision('alpha-1', 1000, 0.03, 0.005, RegimeLabel.TREND_UP);
    const d2 = makeDecision('alpha-2', 2000, 0.01, 0.002, RegimeLabel.RANGE);
    const p1: PortfolioDecisionRecord = {
      targetWeights: { 'BTC/USDT': 0.5 }, grossExposure: 1.0, netExposure: 0.5, volTargetingScale: 1.2,
      activeRiskOverlayAdjustments: ['overlay_drawdown'], timestamp: 1000, totalTurnover: 0.1,
    };
    const o1 = makeOrder('ord-1', 'buy', 1000);
    const o2 = makeOrder('ord-2', 'sell', 2000);
    const f1 = makeFill('fill-1', 'ord-1', 'buy', 1000, 'normal', 2.0, 3.0);
    const f2 = makeFill('fill-2', 'ord-2', 'sell', 2000, 'extreme', 10.0, 42.0);
    const t1 = makeTelem(1000, 15, 30);
    const t2 = makeTelem(2000, 25, 45);

    const report = evaluateObservability({
      alphaDecisions: [d1, d2], portfolioDecisions: [p1], shadowOrders: [o1, o2], shadowFills: [f1, f2],
      operationalTelemetry: [t1, t2], realizedReturns: new Map([['alpha-1:1000', 0.02], ['alpha-2:2000', 0.005]]),
      config: { edgeErosionWarnThresholdBps: 50 },
    });

    expect(report.sampleCounts.alphaDecisions).toBe(2);
    expect(report.sampleCounts.shadowFills).toBe(2);
    expect(report.timeRange.start).toBe(1000);
    expect(report.timeRange.end).toBe(2010);
    expect(report.featureSnapshotProvenance.uniqueHashCount).toBe(2);
    expect(report.featureSnapshotProvenance.featureDependencies).toEqual(['spread', 'volatility']);

    // Edge math: expNet = (0.025 + 0.008)/2 = 0.0165; realNet = (0.02 + 0.005)/2 = 0.0125; erosion = (0.0165 - 0.0125)*10000 = 40 bps
    expect(report.edgeAttribution.expectedNetReturnMean).toBeCloseTo(0.0165, 4);
    expect(report.edgeAttribution.realizedNetReturnMean).toBeCloseTo(0.0125, 4);
    expect(report.edgeAttribution.edgeErosionBps).toBeCloseTo(40, 1);
    expect(report.edgeAttribution.byAlpha['alpha-1']?.winRate).toBe(1);

    // Slippage math: normal exp = 3 bps, extreme exp = 40 bps; mean exp = 21.5 bps; mean real = (3 + 42)/2 = 22.5 bps
    expect(report.slippageAttribution.expectedSlippageBpsMean).toBeCloseTo(21.5, 1);
    expect(report.slippageAttribution.realizedSlippageBpsMean).toBeCloseTo(22.5, 1);
    expect(report.slippageAttribution.bySide.buy.fillCount).toBe(1);
    expect(report.slippageAttribution.bySide.sell.fillCount).toBe(1);

    // Portfolio diagnostics
    expect(report.portfolioDiagnostics.meanGrossExposure).toBe(1.0);
    expect(report.portfolioDiagnostics.activeRiskOverlayTriggers['overlay_drawdown']).toBe(1);

    // Operational diagnostics percentiles
    expect(report.operationalDiagnostics.latency.meanMs).toBe(20);
    expect(report.operationalDiagnostics.provenance.primarySuccessRate).toBe(1);
    expect(report.systemHealth.overallStatus).toBe('HEALTHY');
  });

  it('triggers DEGRADED and CRITICAL transitions for stale data', () => {
    const warnReport = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: [], shadowFills: [],
      operationalTelemetry: [makeTelem(1000, 10, 2500)], config: { stalenessWarnThresholdMs: 2000, stalenessCriticalThresholdMs: 5000 },
    });
    expect(warnReport.systemHealth.overallStatus).toBe('DEGRADED');
    expect(warnReport.systemHealth.alarmCounts.staleData).toBe(1);

    const critReport = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: [], shadowFills: [],
      operationalTelemetry: [makeTelem(1000, 10, 6000)], config: { stalenessWarnThresholdMs: 2000, stalenessCriticalThresholdMs: 5000 },
    });
    expect(critReport.systemHealth.overallStatus).toBe('CRITICAL');
  });

  it('triggers alarms for high latency and provider fallback over budget', () => {
    const latReport = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: [], shadowFills: [],
      operationalTelemetry: [makeTelem(1000, 600, 10)], config: { latencyCriticalThresholdMs: 500 },
    });
    expect(latReport.systemHealth.overallStatus).toBe('CRITICAL');
    expect(latReport.systemHealth.alarmCounts.highLatency).toBe(1);

    const fbReport = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: [], shadowFills: [],
      operationalTelemetry: [makeTelem(1000, 10, 10, true)], config: { fallbackErrorBudgetPct: 0.05 },
    });
    expect(fbReport.systemHealth.overallStatus).toBe('CRITICAL');
    expect(fbReport.systemHealth.alarmCounts.providerFallback).toBe(1);
  });

  it('triggers alarms for unmatched orders and fills', () => {
    const unmatchedOrder = makeOrder('unfilled-1', 'buy', 1000);
    const ghostFill = makeFill('ghost-fill', 'non-existent-ord', 'sell', 1000);
    const report = evaluateObservability({
      alphaDecisions: [], portfolioDecisions: [], shadowOrders: [unmatchedOrder], shadowFills: [ghostFill], operationalTelemetry: [],
    });
    expect(report.systemHealth.overallStatus).toBe('CRITICAL');
    expect(report.systemHealth.alarmCounts.unmatchedOrder).toBe(2);
  });

  it('triggers alarms for adverse slippage and edge erosion', () => {
    const d = makeDecision('alpha-1', 1000, 0.05, 0.001);
    const o = makeOrder('ord-1', 'buy', 1000);
    const f = makeFill('fill-1', 'ord-1', 'buy', 1000, 'normal', 0, 50); // 50 bps slippage vs 3 bps expected = +47 bps delta
    const report = evaluateObservability({
      alphaDecisions: [d], portfolioDecisions: [], shadowOrders: [o], shadowFills: [f], operationalTelemetry: [],
      realizedReturns: { 'alpha-1:1000': -0.01 }, config: { slippageWarnThresholdBps: 10, edgeErosionCriticalThresholdBps: 50 },
    });
    expect(report.systemHealth.overallStatus).toBe('CRITICAL');
    expect(report.systemHealth.alarmCounts.adverseSlippage).toBe(1);
    expect(report.systemHealth.alarmCounts.edgeErosion).toBe(1);
  });

  it('computes edge Sharpe, handles Record lookups and index barrel export', async () => {
    const barrel = await import('../index');
    expect(barrel.evaluateObservability).toBeDefined();

    const d1 = makeDecision('alpha-1', 1000, 0.04, 0.005);
    const d2 = makeDecision('alpha-1', 2000, 0.04, 0.005);
    const report = evaluateObservability({
      alphaDecisions: [d1, d2], portfolioDecisions: [], shadowOrders: [], shadowFills: [],
      operationalTelemetry: [], realizedReturns: { 'alpha-1:1000': 0.01, 'alpha-1:2000': 0.05 },
    });
    expect(report.edgeAttribution.byAlpha['alpha-1']?.sharpe).toBeGreaterThan(0);

    const dSym = makeDecision('alpha-s', 3000, 0.04, 0.005);
    const repSym = evaluateObservability({
      alphaDecisions: [dSym], portfolioDecisions: [], shadowOrders: [], shadowFills: [],
      operationalTelemetry: [], realizedReturns: { 'BTC/USDT': 0.03 },
    });
    expect(repSym.edgeAttribution.byAlpha['alpha-s']?.realizedNetReturnMean).toBe(0.03);
  });
});
