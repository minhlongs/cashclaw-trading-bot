import { describe, it, expect } from 'vitest';
import { GatheralTransientImpactEngine } from '../../src/tree/quantlib/microstructure/gatheral-transient-impact';
import { AlfonsiLOBResilienceEngine } from '../../src/tree/quantlib/microstructure/alfonsi-lob-resilience';

describe('Gatheral & Alfonsi Microstructure Engines', () => {
  it('computes transient non-linear decay impact across execution slices', () => {
    const engine = new GatheralTransientImpactEngine({
      eta: 0.1,
      alpha: 0.5,
      decayRate: 0.5,
      permanentFraction: 0.2,
    });

    const slices = [
      { tradeVolume: 100, executionTimeOffsetMs: 0 },
      { tradeVolume: 100, executionTimeOffsetMs: 1000 },
    ];

    const resultImmediate = engine.computeImpact(100.0, slices, 1000);
    expect(resultImmediate.totalTemporaryImpact).toBeGreaterThan(0);
    expect(resultImmediate.expectedEffectivePrice).toBeGreaterThan(100.0);
    expect(resultImmediate.cumulativeImpactBps).toBeGreaterThan(0);

    // After 5000 ms, temporary impact should have largely decayed
    const resultDelayed = engine.computeImpact(100.0, slices, 5000);
    expect(resultDelayed.totalTemporaryImpact).toBeLessThan(resultImmediate.totalTemporaryImpact);
    expect(resultDelayed.totalPermanentImpact).toBeCloseTo(resultImmediate.totalPermanentImpact, 4);
  });

  it('handles invalid inputs fail-closed in Gatheral impact engine', () => {
    const engine = new GatheralTransientImpactEngine();
    expect(() => engine.computeImpact(0, [], 1000)).toThrow();
    expect(() => engine.computeImpact(-50, [], 1000)).toThrow();
  });

  it('evaluates Alfonsi LOB depth resilience and recovery time', () => {
    const engine = new AlfonsiLOBResilienceEngine({
      kappa: 1.0,
      asymptoticDepth: 100,
      recoveryTolerance: 0.05,
    });

    // Depleted book (depth = 20)
    const depleted = engine.evaluateResilience(20);
    expect(depleted.currentDepthRatio).toBe(0.2);
    expect(depleted.isBookResilient).toBe(false);
    expect(depleted.estimatedRecoveryTimeMs).toBeGreaterThan(1000);

    // Fully recovered book (depth = 98)
    const recovered = engine.evaluateResilience(98);
    expect(recovered.currentDepthRatio).toBe(0.98);
    expect(recovered.isBookResilient).toBe(true);
    expect(recovered.estimatedRecoveryTimeMs).toBe(0);
  });
});
