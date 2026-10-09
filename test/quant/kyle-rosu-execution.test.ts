import { describe, expect, it } from 'vitest';
import { computeKyleRosuExecution } from '@/tree/quantlib/execution/kyle-rosu-engine';

describe('Kyle-Roşu (2019) High-Frequency Informed Trading & Liquidity Execution Engine', () => {
  it('liquidates position and drives price toward fundamental value', () => {
    const res = computeKyleRosuExecution({
      fundamentalValue: 120,
      initialPrice: 100,
      timeHorizon: 1.0,
      numSteps: 5,
      volatility: 0.02,
      noiseTraderStd: 0.05,
      aggressivenessCoeff: 1.2,
      temporaryImpactCoeff: 0.005,
      initialInventory: 1000,
    });

    expect(res.terminalInventory).toBe(0);
    expect(res.trajectory.length).toBe(5);
    expect(res.terminalPrice).toBeGreaterThan(100);
    expect(res.priceDiscoveryEfficiency).toBeGreaterThan(0);
    expect(res.vwapPrice).toBeGreaterThan(100);
  });

  it('drives downward price drift when fundamental value is lower than initial price', () => {
    const res = computeKyleRosuExecution({
      fundamentalValue: 80,
      initialPrice: 100,
      timeHorizon: 1.0,
      numSteps: 4,
      volatility: 0.02,
      noiseTraderStd: 0.05,
      aggressivenessCoeff: 1.0,
      temporaryImpactCoeff: 0.005,
      initialInventory: 500,
    });

    expect(res.terminalInventory).toBe(0);
    expect(res.terminalPrice).toBeLessThan(100);
    expect(res.priceDiscoveryEfficiency).toBeGreaterThan(0);
  });

  it('handles zero initial inventory cleanly', () => {
    const res = computeKyleRosuExecution({
      fundamentalValue: 100,
      initialPrice: 100,
      timeHorizon: 1.0,
      numSteps: 4,
      volatility: 0.02,
      noiseTraderStd: 0.05,
      aggressivenessCoeff: 1.0,
      temporaryImpactCoeff: 0.005,
      initialInventory: 0,
    });

    expect(res.terminalInventory).toBe(0);
    expect(res.totalCost).toBe(0);
    expect(res.vwapPrice).toBe(100);
  });
});
