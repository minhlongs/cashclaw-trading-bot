import { describe, expect, it } from 'vitest';
import { computeAlmgrenLorenzExecution } from '@/tree/quantlib/execution/almgren-lorenz-engine';

describe('Almgren-Lorenz (2007) Adaptive Arrival Price Execution Engine', () => {
  it('executes full block with zero terminal shares on static price path', () => {
    const res = computeAlmgrenLorenzExecution({
      totalShares: 1000,
      timeHorizon: 1.0,
      numSteps: 5,
      volatility: 0.02,
      urgencyCoeff: 0.001,
      adaptiveSensitivity: 0.5,
      initialPrice: 100,
      temporaryImpactCoeff: 0.005,
    });
    expect(res.terminalShares).toBe(0);
    expect(res.trajectory.length).toBe(5);
    expect(res.totalCost).toBeGreaterThan(0);
    expect(res.vwapPrice).toBeLessThan(100);
  });

  it('accelerates execution speed on favorable price drift', () => {
    const neutral = computeAlmgrenLorenzExecution({
      totalShares: 1000,
      timeHorizon: 1.0,
      numSteps: 4,
      volatility: 0.02,
      urgencyCoeff: 0.001,
      adaptiveSensitivity: 1.0,
      initialPrice: 100,
      temporaryImpactCoeff: 0.005,
      priceTrajectory: [100, 100, 100, 100],
    });

    const favorable = computeAlmgrenLorenzExecution({
      totalShares: 1000,
      timeHorizon: 1.0,
      numSteps: 4,
      volatility: 0.02,
      urgencyCoeff: 0.001,
      adaptiveSensitivity: 1.0,
      initialPrice: 100,
      temporaryImpactCoeff: 0.005,
      priceTrajectory: [100, 105, 110, 112],
    });

    expect(favorable.trajectory[1].adaptiveSpeedFactor).toBeGreaterThan(neutral.trajectory[1].adaptiveSpeedFactor);
    expect(favorable.trajectory[1].tradeSize).toBeGreaterThan(neutral.trajectory[1].tradeSize);
  });

  it('handles zero shares cleanly', () => {
    const res = computeAlmgrenLorenzExecution({
      totalShares: 0,
      timeHorizon: 1.0,
      numSteps: 5,
      volatility: 0.02,
      urgencyCoeff: 0.001,
      adaptiveSensitivity: 0.5,
      initialPrice: 100,
      temporaryImpactCoeff: 0.005,
    });
    expect(res.terminalShares).toBe(0);
    expect(res.totalCost).toBe(0);
    expect(res.vwapPrice).toBe(100);
  });
});
