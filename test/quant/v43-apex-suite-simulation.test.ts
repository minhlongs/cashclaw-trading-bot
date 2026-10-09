import { describe, it, expect } from 'vitest';
import { computeGatheralSchiedResilientExecution } from '@/tree/quantlib/execution/gatheral-schied-resilient-engine';
import { computeContKukanovOfi } from '@/tree/quantlib/microstructure/cont-kukanov-ofi-engine';
import { validateAlignment } from '@/tree/alpha/data-quality/validate-alignment';

describe('V43 Apex Suite E2E Cross-Domain Simulation', () => {
  it('simulates resilient power-law execution paired with multi-level OFI and data alignment validation', () => {
    // 1. Multi-level OFI signal evaluation
    const prevLOB = [
      { bidPrice: 200, bidSize: 50, askPrice: 200.5, askSize: 50 },
      { bidPrice: 199.5, bidSize: 100, askPrice: 201, askSize: 100 },
    ];
    const currLOB = [
      { bidPrice: 200, bidSize: 80, askPrice: 200.5, askSize: 40 },
      { bidPrice: 199.5, bidSize: 120, askPrice: 201, askSize: 90 },
    ];

    const ofi = computeContKukanovOfi({
      prevLevels: prevLOB,
      currLevels: currLOB,
      decayBeta: 0.5,
      impactMultiplier: 0.05,
    });
    expect(ofi.totalOfi).toBeGreaterThan(0);
    expect(ofi.predictedPriceImpact).toBeGreaterThan(0);

    // 2. Gatheral-Schied Optimal Execution
    const exec = computeGatheralSchiedResilientExecution({
      initialShares: 500,
      initialPrice: 200,
      timeHorizon: 5,
      numSteps: 5,
      temporaryImpact: 0.002,
      decayRate: 0.15,
      decayExponent: 0.6,
      impactPower: 1,
    });
    expect(exec.trajectory.length).toBe(5);
    expect(exec.terminalShares).toBe(0);
    expect(exec.averageExecutionPrice).toBeLessThan(200);

    // 3. Verify Alignment Check Integrity
    const primary = [{ timestamp: 1000, open: 200, high: 201, low: 199, close: 200.5, volume: 100 }];
    const secondary = [{ timestamp: 1000, open: 200, high: 201, low: 199, close: 200.5, volume: 100 }];
    const check = validateAlignment(primary, secondary);
    expect(check.passed).toBe(true);
    expect(check.violations.length).toBe(0);
  });
});
