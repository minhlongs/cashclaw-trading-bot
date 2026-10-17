import { describe, it, expect } from 'vitest';
import { AmihudIlliquidityEngine } from './amihud-illiquidity-engine';

describe('AmihudIlliquidityEngine (Amihud 2002)', () => {
  it('returns default 0 metrics when observation count is below minimum', () => {
    const engine = new AmihudIlliquidityEngine({ minObservations: 5 });
    const res = engine.estimateIlliquidity([
      { returnPct: 0.01, volumeUsd: 10000 },
      { returnPct: -0.02, volumeUsd: 12000 },
    ]);
    expect(res.sampleCount).toBe(2);
    expect(res.meanIlliquidity).toBe(0);
    expect(res.medianIlliquidity).toBe(0);
    expect(res.isIlliquidRegime).toBe(false);
  });

  it('computes mean and median illiquidity correctly on valid series', () => {
    const engine = new AmihudIlliquidityEngine({
      minObservations: 3,
      scaleFactor: 1e6,
      illiquidityThreshold: 1.5,
    });
    const bars = [
      { returnPct: 0.01, volumeUsd: 10000 }, // 0.01/10000 * 1e6 = 1.0
      { returnPct: 0.02, volumeUsd: 10000 }, // 0.02/10000 * 1e6 = 2.0
      { returnPct: 0.03, volumeUsd: 10000 }, // 0.03/10000 * 1e6 = 3.0
    ];
    const res = engine.estimateIlliquidity(bars);
    expect(res.sampleCount).toBe(3);
    expect(res.meanIlliquidity).toBe(2.0);
    expect(res.medianIlliquidity).toBe(2.0);
    expect(res.isIlliquidRegime).toBe(true);
  });

  it('handles even observation count for median calculation', () => {
    const engine = new AmihudIlliquidityEngine({ minObservations: 4, scaleFactor: 1e6 });
    const bars = [
      { returnPct: 0.01, volumeUsd: 10000 }, // 1.0
      { returnPct: 0.02, volumeUsd: 10000 }, // 2.0
      { returnPct: 0.04, volumeUsd: 10000 }, // 4.0
      { returnPct: 0.05, volumeUsd: 10000 }, // 5.0
    ];
    const res = engine.estimateIlliquidity(bars);
    expect(res.sampleCount).toBe(4);
    expect(res.medianIlliquidity).toBe(3.0);
  });
});
