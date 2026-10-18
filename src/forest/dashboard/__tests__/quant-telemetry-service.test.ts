import { describe, it, expect } from 'vitest';
import {
  computeQuantTelemetrySnapshot,
  computeHamiltonHmmTelemetry,
  computeHrpAllocatorTelemetry,
  computeMartingaleOptimalTransportTelemetry,
  computeRoughPathSignaturesTelemetry,
} from '../quant-telemetry-service';

describe('QuantCockpitTelemetrySnapshot Service (Waves 1–5)', () => {
  it('computes unified paper-only telemetry snapshot including Wave 4 & Wave 5 payloads', () => {
    const snapshot = computeQuantTelemetrySnapshot();
    expect(snapshot.paperOnly).toBe(true);
    expect(snapshot.adrInvariant).toBe('ADR-001');

    expect(snapshot.hamiltonHmm.latestState).toBe('HIGH_VOL_CRISIS');
    expect(snapshot.hamiltonHmm.latestCrisisProb).toBeGreaterThan(0.8);

    expect(snapshot.hrpAllocator.allocations).toHaveLength(5);
    const totalWeight = snapshot.hrpAllocator.allocations.reduce((s, a) => s + a.hrpWeight, 0);
    expect(totalWeight).toBeCloseTo(1, 5);

    expect(snapshot.martingaleOptimalTransport.isSurfaceArbitrageFree).toBe(true);
    expect(snapshot.martingaleOptimalTransport.nodes).toHaveLength(7);
    expect(snapshot.martingaleOptimalTransport.atmLocalVol).toBeGreaterThan(0);

    expect(snapshot.roughPathSignatures.levyArea12).toBeGreaterThan(0);
    expect(snapshot.roughPathSignatures.verdict).toBe('ASSET1_LEADS_MOMENTUM');
  });

  it('switches Wave 4 & Wave 5 scenarios deterministically', () => {
    const calmHmm = computeHamiltonHmmTelemetry('CALM_EXPANSION');
    expect(calmHmm.latestState).toBe('LOW_VOL_BULL');

    const decorrHrp = computeHrpAllocatorTelemetry('DECORRELATED_ALPHA');
    expect(decorrHrp.diversificationRatio).toBeGreaterThan(1.2);

    const butterflyViol = computeMartingaleOptimalTransportTelemetry('BUTTERFLY_VIOLATION');
    expect(butterflyViol.isSurfaceArbitrageFree).toBe(false);

    const solLeads = computeRoughPathSignaturesTelemetry('SOL_LEADS_BTC');
    expect(solLeads.verdict).toBe('ASSET2_LEADS_REVERSAL');
    expect(solLeads.levyArea12).toBeLessThan(0);
  });
});
