import { describe, it, expect } from 'vitest';
import { KyleObizhaevaInvarianceEngine } from '../../src/tree/quantlib/microstructure/kyle-obizhaeva-invariance-engine';
import { BipowerVariationEngine } from '../../src/tree/quantlib/volatility/bipower-variation-engine';
import { computeEdgeDiagnostics } from '../../src/forest/alpha/observability-eval/edge-diagnostics';
import { evaluateDataQuality } from '../../src/forest/alpha/data-quality-eval/evaluate';
import type {
  AlphaDecisionRecord,
  FeatureSnapshotHash,
} from '../../src/tree/alpha/observability/types';
import { RegimeLabel } from '../../src/tree/regime/types';

describe('v17 Apex Multi-Domain Suite E2E Cross-Domain Simulation', () => {
  it('combines BNS jump detection gating with Kyle-Obizhaeva invariance impact scaling', () => {
    const jumpEngine = new BipowerVariationEngine({
      minObservations: 10,
      zCriticalThreshold: 1.96,
    });
    const quietReturns = [
      0.001, -0.001, 0.0015, -0.001, 0.002,
      -0.001, 0.001, -0.0015, 0.001, -0.0005,
      0.001, -0.001, 0.0005, -0.001, 0.001,
    ];
    const jumpResult = jumpEngine.detectJumps(quietReturns);
    expect(jumpResult.hasSignificantJump).toBe(false);

    // If jump engine approves execution, compute optimal invariance impact
    const invarianceEngine = new KyleObizhaevaInvarianceEngine({
      dailyVolumeUsd: 10_000_000,
      dailyVolatility: 0.03,
      betScaleConstant: 5.0,
      impactScaleConstant: 1.0,
    });
    const invariantBet = invarianceEngine.getInvariantBetSize();
    const orderImpact = invarianceEngine.computeImpact(invariantBet * 0.5);
    expect(orderImpact.priceImpactBps).toBeGreaterThan(0);
    expect(orderImpact.isCapacityConstrained).toBe(false);

    // Test with acute shock
    const shockReturns = [...quietReturns];
    shockReturns[7] = 0.09; // 9% discrete jump
    const shockJump = jumpEngine.detectJumps(shockReturns);
    expect(shockJump.hasSignificantJump).toBe(true);
  });

  it('verifies modular observability edge diagnostics and data quality integration', () => {
    const mockDecisions: readonly AlphaDecisionRecord[] = [
      {
        alphaId: 'alpha-v17-jump-invariance',
        direction: 'buy',
        confidence: 0.85,
        timestamp: 1700000000,
        regime: RegimeLabel.TREND_UP,
        expectedReturn: 0.025,
        expectedCost: 0.005,
        expectedTurnover: 0.1,
        horizon: '1h',
        featureDependencies: ['jump_z_score', 'invariance_impact'],
        featureSnapshotHash:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' as FeatureSnapshotHash,
        symbol: 'BTCUSDT',
        metadata: {},
      },
    ];

    const realizedMap = new Map<string, number>();
    realizedMap.set('alpha-v17-jump-invariance:1700000000', 0.028);

    const edgeResult = computeEdgeDiagnostics(mockDecisions, realizedMap);
    expect(edgeResult.expectedNetReturnMean).toBe(0.02);
    expect(edgeResult.realizedNetReturnMean).toBe(0.028);
    expect(edgeResult.edgeDeltaMean).toBe(0.008);
    expect(edgeResult.byAlpha['alpha-v17-jump-invariance']).toBeDefined();

    const dqReport = evaluateDataQuality({
      symbol: 'BTCUSDT',
      timeframe: '1h',
      series: [
        {
          timestamp: 1000,
          open: 100,
          high: 105,
          low: 99,
          close: 102,
          volume: 50,
        },
      ],
    });
    expect(dqReport.symbol).toBe('BTCUSDT');
    expect(dqReport.summary.totalChecks).toBeGreaterThan(0);
  });
});
