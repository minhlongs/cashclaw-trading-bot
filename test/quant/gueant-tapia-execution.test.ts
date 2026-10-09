import { describe, it, expect } from 'vitest';
import { computeGueantTapiaExecution } from '@/tree/quantlib/execution/gueant-tapia-engine';

describe('Guéant-Tapia (2012) Multi-Asset Portfolio Optimal Execution Engine', () => {
  it('computes coordinated liquidation trajectory across multiple assets', () => {
    const res = computeGueantTapiaExecution({
      assets: [
        { symbol: 'BTC', shares: 10, price: 60000, volatility: 0.04, temporaryImpact: 1e-4 },
        { symbol: 'ETH', shares: 100, price: 3000, volatility: 0.05, temporaryImpact: 1e-4 },
      ],
      timeHorizon: 1.0,
      numSteps: 5,
      riskAversion: 1e-4,
    });

    expect(res.steps.length).toBe(5);
    expect(res.totalExecutionCost).toBeGreaterThan(0);
    expect(res.terminalShares.BTC).toBe(0);
    expect(res.terminalShares.ETH).toBe(0);
    expect(res.assetVwaps.BTC).toBeGreaterThan(0);
    expect(res.assetVwaps.ETH).toBeGreaterThan(0);
  });

  it('handles single step terminal liquidation cleanly', () => {
    const res = computeGueantTapiaExecution({
      assets: [
        { symbol: 'SOL', shares: 50, price: 150, volatility: 0.08, temporaryImpact: 2e-4 },
      ],
      timeHorizon: 0.1,
      numSteps: 1,
      riskAversion: 1e-3,
    });

    expect(res.steps.length).toBe(1);
    expect(res.steps[0]!.assetExecutions[0]!.sharesExecuted).toBe(50);
    expect(res.terminalShares.SOL).toBe(0);
  });

  it('handles zero initial shares without negative price distortion', () => {
    const res = computeGueantTapiaExecution({
      assets: [
        { symbol: 'BNB', shares: 0, price: 500, volatility: 0.03, temporaryImpact: 1e-4 },
      ],
      timeHorizon: 0.5,
      numSteps: 2,
      riskAversion: 1e-4,
    });

    expect(res.totalExecutionCost).toBe(0);
    expect(res.terminalShares.BNB).toBe(0);
    expect(res.assetVwaps.BNB).toBe(500);
  });
});
