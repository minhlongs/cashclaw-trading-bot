import { describe, it, expect } from 'vitest';
import { GatheralTransientImpactEngine } from '../../src/tree/quantlib/microstructure/gatheral-transient-impact';
import { AlfonsiLOBResilienceEngine } from '../../src/tree/quantlib/microstructure/alfonsi-lob-resilience';
import { HawkesJumpToxicityEngine } from '../../src/tree/quantlib/microstructure/hawkes-jump-toxicity';
import { LedoitWolfShrinkageEngine } from '../../src/tree/quantlib/portfolio/ledoit-wolf-shrinkage';
import {
  checkLeakageInvariance,
  checkNoSingleWindowDependency,
  checkBaselineComparison,
} from '../../src/forest/alpha/gate/robustness-checks';
import { computePercentiles } from '../../src/forest/alpha/observability-eval/telemetry-diagnostics-metrics';

describe('v14 Apex Multi-Domain Suite End-to-End Simulation', () => {
  it('executes cohesive v14 quantitative simulation across microstructure, risk & gate checks', () => {
    // 1. Microstructure: Gatheral Non-linear Transient Impact
    const impactEngine = new GatheralTransientImpactEngine({
      eta: 0.08,
      alpha: 0.5,
      decayRate: 0.1,
      permanentFraction: 0.1,
    });
    const slices = [
      { tradeVolume: 50, executionTimeOffsetMs: 0 },
      { tradeVolume: 50, executionTimeOffsetMs: 500 },
    ];
    const impactResult = impactEngine.computeImpact(100.0, slices, 600);
    expect(impactResult.expectedEffectivePrice).toBeGreaterThan(100.0);
    expect(impactResult.cumulativeImpactBps).toBeGreaterThan(0);

    // 2. Microstructure: Alfonsi Depth Resilience Recovery
    const alfonsiEngine = new AlfonsiLOBResilienceEngine({
      asymptoticDepth: 200,
      kappa: 0.5,
    });
    const depletedBook = alfonsiEngine.evaluateResilience(60);
    expect(depletedBook.isBookResilient).toBe(false);
    expect(depletedBook.estimatedRecoveryTimeMs).toBeGreaterThan(0);

    // 3. High-Frequency Jump: Hawkes Self-Exciting Toxicity
    const hawkesEngine = new HawkesJumpToxicityEngine({
      baselineIntensity: 1.0,
      excitationAlpha: 0.75,
      decayBeta: 0.85,
    });
    const toxicityResult = hawkesEngine.evaluateIntensity(1000, [
      { timestampMs: 900, volume: 2000 },
      { timestampMs: 980, volume: 5000 },
    ]);
    expect(toxicityResult.currentIntensity).toBeGreaterThan(1.0);

    // 4. Portfolio: Ledoit-Wolf Optimal Shrinkage Covariance
    const shrinkageEngine = new LedoitWolfShrinkageEngine();
    const mockReturns = [
      [0.01, -0.01, 0.02],
      [-0.02, 0.015, -0.01],
      [0.015, -0.005, 0.012],
      [-0.01, 0.02, -0.015],
    ];
    const covariance = shrinkageEngine.computeShrinkageCovariance(mockReturns);
    expect(covariance.covarianceMatrix).toHaveLength(3);
    expect(covariance.shrinkageIntensity).toBeGreaterThan(0);

    // 5. Modularized Gate Invariance Checks
    const leakageCheck = checkLeakageInvariance(0);
    expect(leakageCheck.passed).toBe(true);

    const windowCheck = checkNoSingleWindowDependency([100, 80, 90, 70]);
    expect(windowCheck.passed).toBe(true);

    const baselineCheck = checkBaselineComparison(
      { sharpe: 1.8, netPnl: 5000 },
      { sharpe: 0.5, netPnl: 1000 },
      { sharpe: 0.1, netPnl: 200 }
    );
    expect(baselineCheck.passed).toBe(true);

    // 6. Modularized Observability Metrics
    const latencyStats = computePercentiles([12, 18, 25, 45, 90]);
    expect(latencyStats.count).toBe(5);
    expect(latencyStats.medianMs).toBe(25);
    expect(latencyStats.p95Ms).toBe(90);
  });
});
