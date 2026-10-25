import { describe, it, expect } from 'vitest';
import { computeBertsimasHummelExecution, type BertsimasHummelParams } from '@/tree/quantlib/execution/bertsimas-hummel-engine';

describe('Bertsimas-Lo-Hummel (2000) Dynamic Execution Engine', () => {
  const baseParams: BertsimasHummelParams = {
    totalShares: 10000,
    timeHorizon: 1.0,
    numSteps: 10,
    impactParam: 0.05,
    alphaSignal: 0.02,
    alphaDecay: 0.5,
    signalSensitivity: 1.0,
    riskAversion: 0.001,
  };

  it('computes valid liquidation trajectory fully executing inventory', () => {
    const result = computeBertsimasHummelExecution(baseParams);
    expect(result.trajectory.length).toBe(10);
    expect(result.terminalShares).toBe(0);
    const totalTraded = result.trajectory.reduce((s, step) => s + step.tradeSize, 0);
    expect(totalTraded).toBeCloseTo(10000, 2);
  });

  it('generates cost savings over uniform TWAP under positive decaying alpha', () => {
    const result = computeBertsimasHummelExecution(baseParams);
    expect(result.expectedCost).toBeLessThanOrEqual(result.benchmarkTwapCost);
    expect(result.costSavings).toBeGreaterThanOrEqual(0);
  });

  it('accelerates trading when short-term alpha signal is strong', () => {
    const highAlpha = computeBertsimasHummelExecution({ ...baseParams, alphaSignal: 0.1 });
    const zeroAlpha = computeBertsimasHummelExecution({ ...baseParams, alphaSignal: 0.0 });
    expect(highAlpha.trajectory[0]!.tradeSize).toBeGreaterThan(zeroAlpha.trajectory[0]!.tradeSize);
  });

  it('handles zero shares or edge parameters gracefully', () => {
    const zeroShares = computeBertsimasHummelExecution({ ...baseParams, totalShares: 0 });
    expect(zeroShares.terminalShares).toBe(0);
    expect(zeroShares.expectedCost).toBe(0);
  });
});
