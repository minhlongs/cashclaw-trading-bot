import { describe, it, expect } from 'vitest';
import { GatheralArbitrageEngine } from '@/tree/quantlib/execution/gatheral-arbitrage-engine';

describe('GatheralArbitrageEngine', () => {
  it('evaluates power-law kernel and flags arbitrage-free condition when alpha >= 1', () => {
    const res = GatheralArbitrageEngine.evaluateDecayKernel({
      decayKernel: 'power-law',
      decayFactor: 1.5,
      characteristicTime: 10,
      initialImpact: 0.05,
    });
    expect(res.isArbitrageFree).toBe(true);
    expect(res.isConvex).toBe(true);
    expect(res.isMonotoneDecreasing).toBe(true);
    expect(res.decayHalfLife).toBeGreaterThan(0);
    expect(res.kernelValueAt1).toBeLessThan(0.05);
  });

  it('flags potential arbitrage when power-law alpha < 1', () => {
    const res = GatheralArbitrageEngine.evaluateDecayKernel({
      decayKernel: 'power-law',
      decayFactor: 0.5,
      characteristicTime: 10,
      initialImpact: 0.05,
    });
    expect(res.isArbitrageFree).toBe(false);
  });

  it('evaluates exponential kernel as inherently arbitrage-free', () => {
    const res = GatheralArbitrageEngine.evaluateDecayKernel({
      decayKernel: 'exponential',
      decayFactor: 1.0,
      characteristicTime: 5,
      initialImpact: 0.1,
    });
    expect(res.isArbitrageFree).toBe(true);
    expect(res.isConvex).toBe(true);
    expect(res.decayHalfLife).toBeCloseTo(5 * Math.LN2, 4);
    expect(res.kernelValueAt1).toBeCloseTo(0.1 * Math.exp(-0.2), 4);
  });

  it('throws on non-positive input parameters', () => {
    expect(() => GatheralArbitrageEngine.evaluateDecayKernel({
      decayKernel: 'exponential',
      decayFactor: -1,
      characteristicTime: 5,
      initialImpact: 0.1,
    })).toThrow('Parameters must be positive');
  });
});
