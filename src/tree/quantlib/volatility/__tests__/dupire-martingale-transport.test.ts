import { describe, it, expect } from 'vitest';
import { computeDupireMartingaleSurface } from '../dupire-martingale-transport';

describe('Gatheral SVI + Dupire (1994) Local Volatility & Martingale Optimal Transport (MOT) Kernel', () => {
  const GRID = [-0.25, -0.15, -0.05, 0.0, 0.05, 0.15, 0.25] as const;

  it('produces arbitrage-free butterfly density g(k) > 0, positive Dupire local volatility, and ordered MOT bounds', () => {
    const res = computeDupireMartingaleSurface({
      logMoneynessGrid: GRID,
      maturityYears: 0.25,
      sviA: 0.04,
      sviB: 0.12,
      sviRho: -0.35,
      sviM: 0.0,
      sviSigma: 0.18,
    });

    expect(res.isSurfaceArbitrageFree).toBe(true);
    expect(res.minButterflyG).toBeGreaterThan(0);
    expect(res.atmLocalVol).toBeGreaterThan(0);
    expect(res.meanMotCorridorBps).toBeGreaterThan(0);

    for (const node of res.nodes) {
      expect(node.butterflyDensityG).toBeGreaterThan(0);
      expect(node.dupireLocalVol).toBeGreaterThan(0);
      expect(node.subBoundBps).toBeLessThanOrEqual(node.midPriceBps);
      expect(node.midPriceBps).toBeLessThanOrEqual(node.superBoundBps);
    }
  });

  it('detects butterfly arbitrage violation (g(k) <= 0) under extreme SVI wing slope b', () => {
    const stressed = computeDupireMartingaleSurface({
      logMoneynessGrid: GRID,
      maturityYears: 0.25,
      sviA: 0.005,
      sviB: 2.8,
      sviRho: 0.0,
      sviM: 0.0,
      sviSigma: 0.02,
    });

    expect(stressed.isSurfaceArbitrageFree).toBe(false);
    expect(stressed.minButterflyG).toBeLessThanOrEqual(0);
  });
});
