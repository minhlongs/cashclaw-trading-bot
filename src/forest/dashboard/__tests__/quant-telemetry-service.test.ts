import { describe, it, expect } from 'vitest';
import {
  computeQuantTelemetrySnapshot,
  computeHamiltonHmmTelemetry,
  computeHrpAllocatorTelemetry,
} from '../quant-telemetry-service';

describe('QuantCockpitTelemetrySnapshot Service (Waves 1–4)', () => {
  it('computes unified paper-only telemetry snapshot including Wave 4 hamiltonHmm and hrpAllocator', () => {
    const snapshot = computeQuantTelemetrySnapshot();
    expect(snapshot.paperOnly).toBe(true);
    expect(snapshot.adrInvariant).toBe('ADR-001');

    expect(snapshot.hamiltonHmm.latestState).toBe('HIGH_VOL_CRISIS');
    expect(snapshot.hamiltonHmm.latestCrisisProb).toBeGreaterThan(0.8);
    expect(snapshot.hamiltonHmm.likelihoodRatio2DeltaL).toBeGreaterThan(0);
    expect(snapshot.hamiltonHmm.comparisonRows).toHaveLength(7);

    expect(snapshot.hrpAllocator.allocations).toHaveLength(5);
    const totalWeight = snapshot.hrpAllocator.allocations.reduce((s, a) => s + a.hrpWeight, 0);
    expect(totalWeight).toBeCloseTo(1, 5);
    expect(snapshot.hrpAllocator.diversificationRatio).toBeGreaterThan(1);
  });

  it('switches Hamilton HMM scenarios and HRP correlation regimes deterministically', () => {
    const calmHmm = computeHamiltonHmmTelemetry('CALM_EXPANSION');
    expect(calmHmm.latestState).toBe('LOW_VOL_BULL');
    expect(calmHmm.latestCrisisProb).toBeLessThan(0.15);
    expect(calmHmm.latestSizingMultiplier).toBeGreaterThan(0.85);

    const crisisHrp = computeHrpAllocatorTelemetry('CRISIS_CONTAGION');
    const decorrHrp = computeHrpAllocatorTelemetry('DECORRELATED_ALPHA');
    expect(decorrHrp.portfolioVolatility).toBeLessThan(crisisHrp.portfolioVolatility);
    expect(decorrHrp.diversificationRatio).toBeGreaterThan(crisisHrp.diversificationRatio);
  });
});
