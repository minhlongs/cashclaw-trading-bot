import { describe, expect, it } from 'vitest';
import { computeKratzSchonebornExecution } from '@/tree/quantlib/execution/kratz-schoneborn-engine';

describe('Kratz-Schöneborn (2014) Optimal Liquidation with Dark Pools Engine', () => {
  it('liquidates position across Lit and Dark venues and captures cost savings', () => {
    const res = computeKratzSchonebornExecution({
      initialInventory: 1000,
      initialPrice: 100,
      timeHorizon: 1.0,
      numSteps: 5,
      litTemporaryImpact: 0.01,
      litPermanentImpact: 0.005,
      darkArrivalRate: 2.0,
      darkFillProbability: 0.8,
    });

    expect(res.terminalInventory).toBe(0);
    expect(res.trajectory.length).toBe(5);
    expect(res.darkCaptureRatio).toBeGreaterThan(0);
    expect(res.costSavingsVsPureLitBps).toBeGreaterThan(0);
    expect(res.vwapPrice).toBeLessThanOrEqual(100);
  });

  it('handles zero dark fill probability cleanly by reverting to pure Lit liquidation', () => {
    const res = computeKratzSchonebornExecution({
      initialInventory: 500,
      initialPrice: 100,
      timeHorizon: 1.0,
      numSteps: 4,
      litTemporaryImpact: 0.01,
      litPermanentImpact: 0.005,
      darkArrivalRate: 5.0,
      darkFillProbability: 0.0,
    });

    expect(res.terminalInventory).toBe(0);
    expect(res.darkCaptureRatio).toBe(0);
    expect(res.costSavingsVsPureLitBps).toBeCloseTo(0, 4);
    expect(res.totalCost).toBeGreaterThan(0);
  });

  it('handles zero initial inventory gracefully', () => {
    const res = computeKratzSchonebornExecution({
      initialInventory: 0,
      initialPrice: 100,
      timeHorizon: 1.0,
      numSteps: 4,
      litTemporaryImpact: 0.01,
      litPermanentImpact: 0.005,
      darkArrivalRate: 2.0,
      darkFillProbability: 0.5,
    });

    expect(res.terminalInventory).toBe(0);
    expect(res.totalCost).toBe(0);
    expect(res.darkCaptureRatio).toBe(0);
    expect(res.costSavingsVsPureLitBps).toBe(0);
    expect(res.vwapPrice).toBe(100);
  });
});
