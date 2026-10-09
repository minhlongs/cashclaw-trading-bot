import { describe, it, expect } from 'vitest';
import { computeBouchaudFarmerExecution } from '@/tree/quantlib/execution/bouchaud-farmer-engine';

describe('Bouchaud-Farmer-Lillo (2009) Long-Memory Order Flow Execution Engine', () => {
  it('computes execution trajectory with persistent memory autocorrelation', () => {
    const res = computeBouchaudFarmerExecution({
      initialShares: 1000,
      initialPrice: 100,
      numTrades: 5,
      memoryDecayExponent: 0.5,
      bareImpactMagnitude: 0.05,
      tradeSign: 1,
    });

    expect(res.trajectory.length).toBe(5);
    expect(res.hurstExponent).toBeCloseTo(0.75, 4); // 1 - 0.5 / 2 = 0.75
    expect(res.terminalImpact).toBeGreaterThan(0);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.vwapPrice).toBeLessThan(100); // Selling drives price down
    expect(res.trajectory[4].sharesRemaining).toBe(0);
  });

  it('handles buy execution with tradeSign = -1', () => {
    const res = computeBouchaudFarmerExecution({
      initialShares: 500,
      initialPrice: 50,
      numTrades: 4,
      memoryDecayExponent: 0.4,
      bareImpactMagnitude: 0.02,
      tradeSign: -1,
    });

    expect(res.hurstExponent).toBeCloseTo(0.8, 4);
    expect(res.vwapPrice).toBeGreaterThan(50); // Buying pushes price up
    expect(res.totalExecutionCost).toBeGreaterThan(0);
  });

  it('safely handles edge case with 0 initial shares and 1 trade', () => {
    const res = computeBouchaudFarmerExecution({
      initialShares: 0,
      initialPrice: 100,
      numTrades: 1,
      memoryDecayExponent: 0.5,
      bareImpactMagnitude: 0.01,
    });

    expect(res.totalExecutionCost).toBe(0);
    expect(res.vwapPrice).toBe(100);
    expect(res.trajectory[0].sharesExecuted).toBe(0);
  });
});
