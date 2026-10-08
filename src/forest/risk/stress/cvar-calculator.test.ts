import { describe, it, expect } from 'vitest';
import { calculatePortfolioCvar } from './cvar-calculator';

describe('cvar-calculator', () => {
  it('returns zeroes when losses array is empty or equity is non-positive', () => {
    expect(calculatePortfolioCvar([], 10000)).toEqual({
      confidenceLevel: 0.99,
      parametricVarUsd: 0,
      expectedShortfallCvarUsd: 0,
      worstSimulatedLossUsd: 0,
    });
  });

  it('correctly calculates VaR and CVaR for simulated loss distribution', () => {
    // 100 simulated outcomes: losses from 1 to 100
    const losses = Array.from({ length: 100 }, (_, i) => i + 1);
    const metrics = calculatePortfolioCvar(losses, 10000, 0.95);

    // 95% cutoff index: 94 -> loss 95
    expect(metrics.parametricVarUsd).toBe(95);
    // Tail losses are 95..100 -> avg = 97.5
    expect(metrics.expectedShortfallCvarUsd).toBe(97.5);
    expect(metrics.worstSimulatedLossUsd).toBe(100);
  });
});
