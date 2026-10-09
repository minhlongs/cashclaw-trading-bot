import { describe, it, expect } from 'vitest';
import { KyleAdverseSelectionEngine } from '../../src/tree/quantlib/microstructure/kyle-adverse-selection-engine';
import { calculateAdaptiveVolumeSlices } from '../../src/tree/execution/oms/adaptive-volume-slicer';
import type { SignedOrderFlowTrade } from '../../src/tree/quantlib/microstructure/kyle-adverse-selection-types';

describe('Phase 01: Kyle Microstructure & Adaptive OMS Execution', () => {
  it('correctly estimates Kyle lambda and classifies adverse selection risk', () => {
    const engine = new KyleAdverseSelectionEngine();

    // Synthetic trades where positive buy volume pushes price up linearly
    const trades: SignedOrderFlowTrade[] = [
      { timestamp: 1000, price: 100.0, quantity: 10, side: 'BUY' },
      { timestamp: 2000, price: 100.5, quantity: 15, side: 'BUY' },
      { timestamp: 3000, price: 101.2, quantity: 20, side: 'BUY' },
      { timestamp: 4000, price: 100.8, quantity: 12, side: 'SELL' },
      { timestamp: 5000, price: 101.5, quantity: 18, side: 'BUY' },
      { timestamp: 6000, price: 102.2, quantity: 25, side: 'BUY' },
    ];

    const result = engine.estimateLambda(trades);
    expect(result.observationCount).toBe(6);
    expect(result.lambda).toBeGreaterThan(0);
    expect(result.rSquared).toBeGreaterThan(0);
    expect(result.netSignedOrderFlow).toBeGreaterThan(0);
  });

  it('handles fallback gracefully when observations are insufficient', () => {
    const engine = new KyleAdverseSelectionEngine({ minObservations: 5 });
    const trades: SignedOrderFlowTrade[] = [
      { timestamp: 1000, price: 100.0, quantity: 10, side: 'BUY' },
      { timestamp: 2000, price: 100.5, quantity: 15, side: 'BUY' },
    ];

    const result = engine.estimateLambda(trades);
    expect(result.lambda).toBe(0);
    expect(result.adverseSelectionRisk).toBe('LOW');
  });

  it('calculates adaptive U-shape volume slices conserving total quantity', () => {
    const slices = calculateAdaptiveVolumeSlices({
      totalQuantity: 100,
      sliceCount: 5,
    });

    expect(slices).toHaveLength(5);
    const sumAlloc = slices.reduce((sum, s) => sum + s.targetQuantity, 0);
    expect(sumAlloc).toBeCloseTo(100, 4);

    // In a U-shape curve, the first and last slices have higher weights than the middle slice
    expect(slices[0]!.targetQuantity).toBeGreaterThan(slices[2]!.targetQuantity);
    expect(slices[4]!.targetQuantity).toBeGreaterThan(slices[2]!.targetQuantity);
  });

  it('honors custom volume weights correctly', () => {
    const slices = calculateAdaptiveVolumeSlices({
      totalQuantity: 50,
      sliceCount: 3,
      volumeWeights: [0.5, 0.2, 0.3],
    });

    expect(slices).toHaveLength(3);
    expect(slices[0]!.targetQuantity).toBeCloseTo(25, 4);
    expect(slices[1]!.targetQuantity).toBeCloseTo(10, 4);
    expect(slices[2]!.targetQuantity).toBeCloseTo(15, 4);
  });
});
