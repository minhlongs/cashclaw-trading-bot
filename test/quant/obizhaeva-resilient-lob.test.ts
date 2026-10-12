import { describe, it, expect } from 'vitest';
import { ObizhaevaResilientLobEngine } from '../../src/tree/quantlib/execution/obizhaeva-resilient-lob-engine';

describe('Obizhaeva & Wang (2013) Resilient LOB & Transient Market Impact Engine', () => {
  it('calculates optimal discrete liquidation trajectory with jumps and continuous rate', () => {
    const config = {
      initialInventory: 1000,
      horizon: 10,
      resilienceRate: 0.5,
      impactFactor: 0.01,
      steps: 10,
    };
    const res = ObizhaevaResilientLobEngine.calculateTrajectory(config);
    // denom = 2 + 0.5 * 10 = 7
    // x0 = 1000 / 7 ≈ 142.857
    // dotX = (0.5 * 1000) / 7 ≈ 71.428
    // xN = 1000 / 7 ≈ 142.857
    expect(res.initialJump).toBeCloseTo(1000 / 7, 3);
    expect(res.continuousRate).toBeCloseTo(500 / 7, 3);
    expect(res.terminalJump).toBeCloseTo(1000 / 7, 3);
    expect(res.schedule.length).toBe(11);
    expect(res.expectedCost).toBeGreaterThan(0);
  });

  it('throws error on invalid configuration parameters', () => {
    expect(() => {
      ObizhaevaResilientLobEngine.calculateTrajectory({
        initialInventory: 100,
        horizon: -1,
        resilienceRate: 0.5,
        impactFactor: 0.01,
        steps: 10,
      });
    }).toThrow('Invalid Obizhaeva LOB configuration parameters');
  });
});
